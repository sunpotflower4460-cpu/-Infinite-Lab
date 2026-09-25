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
本実装は向き φ[n] を毎回 n から直接求める。n と modifier は float64 の値を **その値が表す有理数として厳密に** 扱い、C は計算済みの桁から 120 桁（448 bit）を BigInt 固定小数点で持つ。積と `mod 360` を BigInt で計算し、最後の結果だけ float64 に丸める（`src/math/exactReduce.ts`、式木ノード `constMod`）。
C = π, modifier = 1 なら 1 step あたり π 度（≈ 3.14159°）回る。360/π は有理数でないため、軌跡は閉じない。

## Reference Reconstruction（v0.4+）

動画などの見た目から生成規則を推定する場合、候補式を実行して比較し、一致しないものは棄却する。
正確な生成規則が確認できない限り「再現」とは表記しない。

---

## 実験の追加方法

1. `src/experiments/<id>/index.ts` に `ExperimentDefinition` を実装する。
   - `formulas`: `assign(target, expr)` の配列。数値は **必ず** `runFormulas(formulas, env, symbols, trace, ctx)` で得る（表示と実行を一致させるため）。定数の値を使う場合は `constMod` ノードと `ctx.constant.binary` を使う。
   - `create()`: `GeometryExperiment`（`initialize / step / snapshot / restore / reset`）を返す。状態は `snapshot()` で完全に復元できること。
   - `Math.random`, `Date`, `Math.sin/cos` は使わない（式木の `sin`/`cos` は決定的実装）。
2. `src/experiments/registry.ts` に登録する（UI のセレクタとパラメータ欄は自動生成）。
3. テスト: step 1〜3 の座標が手計算値と一致すること、決定性、`inspect()` と連続実行の一致。
