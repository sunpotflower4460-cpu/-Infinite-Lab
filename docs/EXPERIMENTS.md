# Experiments

すべての実験は「数字を図形へ変換する規則の一例」であり、「π 本来の形」ではありません。UI にも規則そのものを表示します。

## 共通の約束

- step n（1 始まり）は数字列の位置 `startOffset + n − 1` の digit を 1 つ消費する。
  - `start at 3.`（既定）: `startOffset = 0` → 3, 1, 4, 1, 5, 9, …
  - `start at .1`: `startOffset = integerPartLength` → 1, 4, 1, 5, 9, …
- 使用可能な step 数 = 計算した桁数 − startOffset。桁を使い切ったら停止する。
- 式中の変数: `digit`, `n`（step 番号）, 各パラメータ、実験が持つ前ステップの状態（例 `x_prev`）、それ以前の式の結果。

---

## 01 Digit Circle Walk — `π digit driven circle walk`（v0.1）

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

## 02 Circle Chain（v0.2 予定）

```
r[n]      = digit × radiusScale
θ[n]      = θ[n−1] + digit / 10 × 2π     (cumulative)   または   digit / 10 × 2π   (absolute)
center[n] = center[n−1] + r[n−1] × (cos θ[n], sin θ[n])   — 前の円の円周上
```

digit 0 → 半径 0 は点として正直に描画する（見栄えのための置き換えはしない）。
狙い: 円 → 花 → 複雑な構造 → 網状構造 が自然発生する条件の探索。

## 03 Pi Rotation（v0.2 予定）

```
θ[n] = n × π × modifier  mod 2π      （BigInt 固定小数点の π で厳密に剰余してから float64 化）
p[n] = p[n−1] + distance × (cos θ[n], sin θ[n])
```

digit ではなく π の値そのものによる回転の長期的構造を観察する。

## Reference Reconstruction（v0.4+）

動画などの見た目から生成規則を推定する場合、候補式を実行して比較し、一致しないものは棄却する。
正確な生成規則が確認できない限り「再現」とは表記しない。

---

## 実験の追加方法

1. `src/experiments/<id>/index.ts` に `ExperimentDefinition` を実装する。
   - `formulas`: `assign(target, expr)` の配列。数値は **必ず** `runFormulas(formulas, env, symbols, trace)` で得る（表示と実行を一致させるため）。
   - `create()`: `GeometryExperiment`（`initialize / step / snapshot / restore / reset`）を返す。状態は `snapshot()` で完全に復元できること。
   - `Math.random`, `Date`, `Math.sin/cos` は使わない（式木の `sin`/`cos` は決定的実装）。
2. `src/experiments/registry.ts` に登録する（UI のセレクタとパラメータ欄は自動生成）。
3. テスト: step 1〜3 の座標が手計算値と一致すること、決定性、`inspect()` と連続実行の一致。
