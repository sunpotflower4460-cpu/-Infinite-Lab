# Experiments

すべての実験は「数字を図形へ変換する規則の一例」であり、「π 本来の形」ではありません。UI にも規則そのものを表示します。
説明文の `{C}` は選択中の定数の記号（π / e / √2 / φ）に置き換えて表示します。

## Presets

| 名前            | 内容                                                |
| --------------- | --------------------------------------------------- |
| Pi Walk         | Digit Circle Walk、π 10,000 桁                      |
| Pi Circle Chain | Circle Chain、cumulative、radiusScale 2             |
| Pi Flower       | Circle Chain、absolute、radiusScale 3、中心間リンク |
| Pi Orbit        | Pi Rotation、modifier 1（π° / step）                |
| Pi Spiral       | Pi Rotation、modifier 10（10π° ≈ 31.4159° / step）  |

名前はラベルに過ぎず、形の性質を主張するものではありません。保存形式は仕様 §24 と同じ
`{ "constant": "pi", "experiment": "circle-chain", "parameters": { "radiusScale": 2 } }`（`src/lab/presets.ts`）。

## 共通の約束

- step n（1 始まり）は数字列の位置 `startOffset + n − 1` の digit を 1 つ消費する。
  - `start at 3.`（既定）: `startOffset = 0` → 3, 1, 4, 1, 5, 9, …
  - `start at .1`: `startOffset = integerPartLength` → 1, 4, 1, 5, 9, …
- 使用可能な step 数 = 計算した桁数 − startOffset。桁を使い切ったら停止する。
- 式中の変数: `digit`, `n`（step 番号）, 各パラメータ、実験が持つ前ステップの状態（例 `x_prev`）、それ以前の式の結果。

---

## 01 Digit Circle Walk — `{C} digit driven circle walk`（v0.1）

状態: walker の位置 `(x, y)`、初期値 `(0, 0)`。

```
angle  = digit / 10 × 2π
x[n]   = x[n−1] + cos(angle) × distance
y[n]   = y[n−1] + sin(angle) × distance
radius = radiusBase + digit × radiusScale
```

出力: `line(x[n−1], y[n−1] → x[n], y[n])`（DRAW PATH 有効時）、`circle(x[n], y[n], radius)`

| パラメータ  | 既定 | 範囲    |
| ----------- | ---- | ------- |
| distance    | 10   | 0.5–100 |
| radiusBase  | 2    | 0–50    |
| radiusScale | 0.5  | 0–10    |
| drawPath    | true |         |

観察メモ: digit は 10 方向のどれかを選ぶので、π の桁が一様分布に近ければ 2 次元のランダムウォークに似た振る舞いになる（π が正規数かどうかは未解決問題であり、この観察は証明ではない）。
例: π を 1,000 桁使ったときの軌跡の形は、ある特定の 1,000 個の digit の並びを反映した一つの結果に過ぎない。

---

## 02 Circle Chain — `{C} digit driven circle chain`（v0.2）

状態: 前の円の中心 `(x, y)`、半径 `r`、方向 `θ`。初期値はすべて 0（最初の円は原点）。

```
r[n] = digit × radiusScale
θ[n] = (cumulative × θ[n−1] + digit / 10 × 2π) mod 2π
x[n] = x[n−1] + cos(θ[n]) × r[n−1]        — 前の円の円周上
y[n] = y[n−1] + sin(θ[n]) × r[n−1]
```

出力: `circle(x[n], y[n], r[n])`（DRAW LINKS 有効時は中心間の line も）

| パラメータ  | 既定  | 範囲                                                            |
| ----------- | ----- | --------------------------------------------------------------- |
| radiusScale | 2     | 0.1–50                                                          |
| cumulative  | true  | true: 方向が累積（θ[n−1] に加算） / false: digit ごとの絶対方向 |
| drawLinks   | false |                                                                 |

- digit 0 → 半径 0 の円。見栄えのために置き換えず、点として描画する。
- `mod 2π` は float64 の 2π（6.283185307179586）による剰余。

## 03 Pi Rotation — `{C} value driven rotation walk`（v0.2）

digit ではなく **定数の値そのもの** を使う。各 step で C × modifier 度だけ向きを変え、一定距離進む。

```
φ[n]° = (n × modifier × C) mod 360        — BigInt で厳密に積と剰余を計算
θ[n]  = φ[n]° / 180 × π                     — float64
x[n]  = x[n−1] + cos(θ[n]) × distance
y[n]  = y[n−1] + sin(θ[n]) × distance
```

出力: `line`（DRAW PATH 有効時）と、`point`（markerRadius = 0）または `circle`。

| パラメータ   | 既定 | 範囲       |
| ------------ | ---- | ---------- |
| modifier     | 1    | −1000–1000 |
| distance     | 5    | 0.1–100    |
| markerRadius | 0    | 0–50       |
| drawPath     | true |            |

**累積誤差を避ける設計**: 仕様の「各 step で angle += π × modifier」をそのまま float64 で足し続けると、丸め誤差が蓄積する（100 万 step で 10⁻⁹ 度以上ずれることをテストで確認）。
本実装は向き φ[n] を毎回 n から直接求める。n と modifier は float64 の値を **その値が表す有理数として厳密に** 扱い、C は（選んだ精度に関係なく）120 桁（448 bit）を BigInt 固定小数点で持つ。積と `mod 360` を BigInt で計算し、最後の結果だけ float64 に丸める（`src/math/exactReduce.ts`、式木ノード `constMod`）。
C = π, modifier = 1 なら 1 step あたり π 度（≈ 3.14159°）回る。360/π は有理数でないため、軌跡は閉じない。

## 04 Two-Arm Rotation — `{C} two-arm rotation`（v0.4、参照動画の候補規則）

2 本の腕をつなぎ、腕 1 は速さ 1、腕 2 は速さ C で回す。先端のペンの軌跡を t = n·dt ごとに結ぶ。

```
θ₁ = (n × dt) mod 2π              — BigInt で厳密に計算（累積誤差なし）
θ₂ = (n × dt × C) mod 2π          — 同上（π と C は約 120 桁）
x[n] = scale × (r1 × cos(θ₁) + r2 × cos(θ₂))
y[n] = scale × (r1 × sin(θ₁) + r2 × sin(θ₂))
```

出力: 前の点から今の点への `line`。腕（2 本の線）は現在の step のハイライトにだけ表示し、図形としては保存しない。

| パラメータ | 既定 | 範囲     |
| ---------- | ---- | -------- |
| dt         | 0.05 | 0.0001–1 |
| r1, r2     | 1, 1 | 0–5      |
| scale      | 100  | 1–1000   |
| drawArms   | true |          |

r1 = r2 のとき、どのループも中心を通る。C が無理数なら曲線は閉じない（C の有理近似 p/q で p − q 枚の花びらにほぼ閉じる。π ≈ 22/7 → 15 枚、355/113 → 242 枚）。digit は使わず、桁数は step 数の上限だけを決める。

## 05 Formula Playground — `{C} digits through your own formulas`（v0.5、仕様 §10）

ANGLE / RADIUS / DISTANCE を式で書くと、その式が既存の式木（Formula AST）に変換され、そのまま実行・表示される（表示 = 実行）。骨格は固定:

```
angle    = （ANGLE の式）
radius   = （RADIUS の式）
distance = （DISTANCE の式）
x[n] = x[n−1] + cos(angle) × distance
y[n] = y[n−1] + sin(angle) × distance      → 半径 radius の circle（と前の点からの line）
```

- 使える名前: `n`（step）、`digit`、`angle_prev`、`x_prev`、`y_prev`、`π`。関数: `sin cos abs sqrt`。演算子: `+ − × / mod ( )`、`2π` のような数と名前の積。
- すべて float64（π = 3.141592653589793）。ただし選択中の定数 `C` は厳密な形でだけ使える: `(… × C) mod 2π` と `(… × C) mod 整数` は BigInt で約 120 桁の C を使って計算する。`n × C` のように float64 に丸める書き方はエラーにして理由を示す（大きな n で桁が失われるため）。
- `(f × g) mod 2π`（2 つ以上の因子の積）も BigInt で厳密に計算する。和や単独の値の `mod 2π` は float64 の mod。
- 表示された式を貼り直すと同じ式木になる（3,000 個のランダムな式木と全実験の式で、計算結果がビット単位で一致することをテスト）。
- 値が有限でない（0 で割った等）・半径が負のときは、その step と理由を示して止まる。式を直せば新しく実行し直す。
- 式は設定・Export（ファイル形式 v3）・履歴・Compare に含まれる。

## 06 Two-Arm 3D — Torus / Ball / Height（v0.6）

2D の Two-Arm は「腕の長さが輪郭（半径 r1 + r2 の円盤）を決め、**速さの比が埋まるかどうかを決める**」装置である。比が分数 p/q なら q 周で閉じて止まり（22/7 → 15 枚の花びら、3.14 = 157/50 → 107 枚）、π なら永遠に閉じずに円盤を埋める。
3D の各表示は、**同じ装置を立体に組み替えたもの**で、この考え方をそのまま保つ。角度はすべて 04 と同じく BigInt で厳密に計算する:
θ₁ = (n × dt) mod 2π、θ₂ = (n × dt × C) mod 2π、θ₃ = (n × dt × C²) mod 2π。

キャンバス右上の **2D / Torus / Ball / Height** で切り替える（dt, r1, r2, scale などは引き継ぐ）。**vs 22/7** で、同じ装置を速さの比 22/7 で横に並べて同時に再生する（Compare Mode）。
各 step は `point(x, y, z)` を 1 つ出力し、3D ビューは前の step の点と直線で結ぶ（04 が前のペン位置と結ぶのと同じ）。腕は現在の step にだけ表示し、図形としては保存しない。
2D の表示・SVG は真上から見た (x, y)、CSV には最後の列に z が付く。z も SHA-256 の対象。

| 表示   | 実験 id          | 装置                                                            | 規則                                                                                                       |
| ------ | ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Torus  | `two-arm-torus`  | 腕 2 を台の上ではなく **縦の面** で回す                         | ρ = r1 + r2 × cos(θ₂)、x = scale × ρ × cos(θ₁)、y = scale × ρ × sin(θ₁)、z = scale × r2 × sin(θ₂)          |
| Ball   | `two-arm-ball`   | 2D の装置をそのまま置いた **台ごと** x 軸のまわりに C² 倍で回す | x = scale × (r1 cos θ₁ + r2 cos θ₂)、u = scale × (r1 sin θ₁ + r2 sin θ₂)、y = u × cos(θ₃)、z = u × sin(θ₃) |
| Height | `two-arm-height` | 2D の装置のペン先を時間で持ち上げる                             | x, y は 04 のペン位置そのもの、z = scale × rise × (n × dt)                                                 |

- **Torus**: ペン先が届くのは R = r1、r = r2 のトーラスの表面だけ（2D で半径 r1 + r2 の円盤だけに届くのと同じ）。比が分数 p/q なら q 周で閉じる **トーラス結び目**（22/7 なら 22 回巻いて 7 周で閉じる）、π なら閉じずに表面を埋め尽くす。
- **Ball**: 台の上のペン先は 2D と同じく円盤の中にあり、その円盤を直径のまわりに回すと球の中身をすべて通る。2 つの速さで回る曲線が埋められるのは面まで（2D の円盤、トーラスの表面）で、**中身まで埋めるには互いに分数の関係にない速さが 3 つ要る**。1 : π : π² は π が超越数なのでこの条件を満たし、使う数は π だけ。分数 p/q では閉じるが、22/7 の場合は 1 : 22/7 : 484/49 が t = 98π（dt = 0.05 で約 6,158 step）で閉じるまでの経路がとても長いので、画面ではかなり球に近く見える（すき間が残る）。違いがはっきり見えるのは 2D と Torus。
- **Height**: 04 の 2D の軌跡を、時間 t に比例して持ち上げたもの。どの周で模様が変わったかを高さで見られる。
- 注意: dt = 0.05 のとき θ₂ = n × dt × π ≈ nπ/20 なので、θ₂ は **ほぼ** 40 通りの値に集まる（点は 40 本の円の近くに並び、線はその間を結ぶ）。厳密に 40 通りではない: float64 の 0.05 は正確には 0.05000000000000000277… で、アプリはこの値をそのまま有理数として使うため、同じ組の θ₂ どうしも n = 10⁶ で約 10⁻¹¹ rad ずれる。θ₁ と θ₂ は同じ dt を使うので、比 θ₂ / θ₁ = π は厳密に保たれる。θ₁ ≈ n/20 は 2π と通約不能なので繰り返さない。
- 比較用の値 **22/7・355/113・3.14** は、Constant の選択肢にもある（割り算で全桁が正確）。角度の計算では他の定数と同じく小数点以下 120 桁で使うので、「閉じる」はずれが 10⁻¹¹⁸ 程度の意味で閉じる（画面上は区別できない）。
- 3D ビュー: ドラッグで回転、右ドラッグ／2 本指で移動、ホイール／ピンチで拡大、クリックでその step を Inspector に表示、ダブルクリックで全体表示、⟳ Rotate で自動回転。Timeline・Microscope・Glow・PNG（3D の見たまま）・**動画**（その視点のまま。⟳ Rotate がオンなら 1 フレームごとに一定角だけ回して録画）に対応。
- 表示範囲: 装置が届く範囲（2D・Torus・Ball は半径 scale × (r1 + r2)、Torus の高さは ± scale × r2）を 1 step 目から映す。描き始めの数本の線に極端に拡大しない。Height は上へ伸びるので、なめらかに追いかける。3D 表示中は、下に隠れた 2D の描画を止める。
- 3D の描画は表示のみ（GPU には float32 で渡す）。データ・書き出し・SHA-256 は float64 のまま。

## Reference Reconstruction（v0.4）

参照動画（`docs/reference/`）の生成規則を、仕様 §40 の手順で検証する（`tools/reference/analyze.py` → `docs/reference/ANALYSIS.md`）。

1. 動画からフレームを切り出し、アプリの UI 部分を除いた描画領域だけを使う
2. 候補の式（2 本の等長の腕、速さの比 c = π, 355/113, 22/7, 3.2, √10, 3, e, φ+1）を描く
3. 回転に依存しない特徴（半径方向の明るさ・角度方向の対称性）で比較する
4. 一致しない候補を棄却する

結果: 動画は花の段階で **15 回対称** がはっきり出て、その後それが消える。これを満たすのは c = π（と、この動画では区別できない 355/113）だけで、22/7 は 15 回対称のまま閉じてしまうため後半と矛盾し、その他の候補は花の段階で対称性が合わない。
したがって動画は「c = π の Two-Arm Rotation と矛盾しない」が、腕の長さの比・描画速度・発光の表現は推定であり、「再現」とは表記しない。

---

## 実験の追加方法

1. `src/experiments/<id>/index.ts` に `ExperimentDefinition` を実装する。
   - `formulas`: `assign(target, expr)` の配列。数値は **必ず** `runFormulas(formulas, env, symbols, trace, ctx)` で得る（表示と実行を一致させるため）。定数の値を使う場合は `constMod` ノードと `ctx.constant.binary` を使う。
   - `create()`: `GeometryExperiment`（`initialize / step / snapshot / restore / reset`）を返す。状態は `snapshot()` で完全に復元できること。
   - `Math.random`, `Date`, `Math.sin/cos` は使わない（式木の `sin`/`cos` は決定的実装）。
2. `src/experiments/registry.ts` に登録する（UI のセレクタとパラメータ欄は自動生成）。
3. テスト: step 1〜3 の座標が手計算値と一致すること、決定性、`inspect()` と連続実行の一致。
