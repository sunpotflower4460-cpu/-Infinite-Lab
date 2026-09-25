# π Infinite Lab

**Mathematical Visualization / Infinite Experiment Engine**

円周率 π を実際に任意精度で計算し、その数字列に定義された規則を適用して、図形が 1 ステップずつ生まれていく過程を観察する数学実験アプリです。

```
計算 (Chudnovsky, BigInt) → 数字 (3,1,4,1,5,9,…) → 規則 (式) → 図形 (circle, line) → 描画 (WebGL)
```

目的は「綺麗な模様を表示すること」ではなく、**どの数字が・どの式で・なぜその位置に描かれたのか** を、画面上のすべての図形について遡れることです。

## 現在の実験 (v0.1)

### Experiment 01 — Digit Circle Walk (`π digit driven circle walk`)

π の各桁 `digit` を順に読み、歩行者 (walker) を動かします。

```
angle  = digit / 10 × 2π                        (digit → 10 方向のいずれか)
x[n]   = x[n−1] + cos(angle) × distance
y[n]   = y[n−1] + sin(angle) × distance
radius = radiusBase + digit × radiusScale
```

各ステップで `line(前の位置 → 新しい位置)` と `circle(新しい位置, radius)` を描きます。
開始点は原点 `(0, 0)`、既定では整数部の `3` から読み始めます（`start at .1` で小数第 1 位から）。

> これは数字を図形へ変換する **一つの恣意的な規則** です。「π 本来の形」ではありません。

Inspector には、実行された式そのもの（表示用に別途書かれた式ではなく、評価に使われた同じ式木）と、
代入後の式・float64 の値がそのまま表示されます。例: `angle = digit / 10 × 2π = 9 / 10 × 2π = 5.654866776461628`

## 使い方

```bash
npm install
npm run dev          # http://localhost:5173
```

| 操作                                 |                                                     |
| ------------------------------------ | --------------------------------------------------- |
| ▶ / ⏸ (Space)                        | 再生 / 一時停止                                     |
| ⏭ (→)                                | 1 ステップ実行                                      |
| ⏮ (R)                                | リセット                                            |
| 1x / 10x / 100x / 1,000x / MAX       | 10 / 100 / 1,000 / 10,000 steps/s / 可能な限り速く  |
| ホイール / ドラッグ / ダブルクリック | ズーム / パン / その位置を中心に                    |
| Fit All                              | 全体表示 + 自動追従                                 |
| Inspector の `Inspect`               | 任意の実行済みステップを再実行して説明を表示        |
| Scientific Mode                      | アルゴリズム・精度・計算時間・FPS・演算の種類を表示 |

Precision は 100 / 1,000 / 10,000 / 100,000 桁。計算した桁を使い切ると停止し、その旨を表示します（桁を捏造して続けることはしません）。

## 数学的真正性の方針

- π は **BigInt による Chudnovsky 級数 (binary splitting)** で計算。要求桁 +20 桁の guard digits で計算し、**切り捨て** で確定（丸めない）。
- 検証: 外部参照値（10,000 桁）との一致、独立アルゴリズム（Machin の公式）との 5,000 桁一致、開発時に 1,000,000 桁まで外部参照と一致を確認。
- 図形計算は **IEEE-754 float64**。そのことを UI（Scientific Mode）とドキュメントに明記しています。式中の `π` は float64 の最近接値 `3.141592653589793` です。
- `sin` / `cos` は fdlibm を移植した **決定的実装**（`Math.sin` はブラウザ間で最終ビットが異なり得るため）。
- 乱数は使用しません。同じ条件なら、どの環境でも **ビット単位で同じ図形** になります（テストで保証）。

詳しくは [docs/MATHEMATICS.md](docs/MATHEMATICS.md)。

## 開発

```bash
npm run test        # unit tests (Vitest)
npm run test:e2e    # E2E (Playwright)
npm run typecheck
npm run lint
npm run build
```

| ドキュメント                                 | 内容                                     |
| -------------------------------------------- | ---------------------------------------- |
| [docs/VISION.md](docs/VISION.md)             | 思想と原則                               |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | パイプライン・Worker・Renderer の構成    |
| [docs/MATHEMATICS.md](docs/MATHEMATICS.md)   | π 計算、精度、決定性、検証               |
| [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md)   | 実験の定義と追加方法                     |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | マイルストーンと v0.1 Definition of Done |

## 技術スタック

TypeScript · React · Vite · PixiJS v8 (WebGL) · Web Workers · Zustand · Vitest · Playwright · native BigInt
