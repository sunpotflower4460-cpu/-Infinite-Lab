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
