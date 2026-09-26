# π Infinite Lab

**Mathematical Visualization / Infinite Experiment Engine**

円周率 π を実際に任意精度で計算し、その数字列に定義された規則を適用して、図形が 1 ステップずつ生まれていく過程を観察する数学実験アプリです。

```
計算 (Chudnovsky, BigInt) → 数字 (3,1,4,1,5,9,…) → 規則 (式) → 図形 (circle, line) → 描画 (WebGL)
```

目的は「綺麗な模様を表示すること」ではなく、**どの数字が・どの式で・なぜその位置に描かれたのか** を、画面上のすべての図形について遡れることです。

## 参照動画の模様を見る（Film mode）

**https://sunpotflower4460-cpu.github.io/-Infinite-Lab/#film** （スマホでも開けます）

参照動画（`docs/reference/`）と同じ規則 — 2 本の腕をつなぎ、2 本目を 1 本目の **π 倍** の速さで回したときのペン先の軌跡
`e^{it} + e^{iπt}` — を、白い光の線で全画面に描きます。時間とともに描画が加速し、花 → 網目 → 光る球へと変わっていきます。
画面をタップで一時停止 / 再開、✕ で実験画面（Two-Arm Rotation、式と各 step を確認できる）に戻ります。
π は 3.14 ではなく約 120 桁の精度で角度を厳密に計算しています。

> 公開には一度だけリポジトリの設定が必要です: Settings → Pages → Build and deployment → Source を **GitHub Actions** にする。
> 以後 main に入るたびに自動で公開されます（`.github/workflows/pages.yml`）。

## 定数 (v0.2)

| 定数 | アルゴリズム（すべて BigInt）       |
| ---- | ----------------------------------- |
| π    | Chudnovsky 級数（binary splitting） |
| e    | Σ 1/k!（binary splitting）          |
| √2   | 厳密な整数平方根                    |
| φ    | (1 + √5) / 2（厳密な整数平方根）    |

どの定数も、誤差上界から **表示される全桁が正しいことを保証** してから使います（`computeCertain`）。

## 実験 (v0.2)

| 実験                     | 規則（Inspector に表示される式そのもの）                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 Digit Circle Walk** | `angle = digit / 10 × 2π`, `x[n] = x[n−1] + cos(angle) × distance`, `radius = radiusBase + digit × radiusScale`                               |
| **02 Circle Chain**      | `r[n] = digit × radiusScale`, `θ[n] = (cumulative × θ[n−1] + digit / 10 × 2π) mod 2π`, 中心 = 前の円周上 `x[n] = x[n−1] + cos(θ[n]) × r[n−1]` |
| **03 Pi Rotation**       | `φ[n]° = (n × modifier × C) mod 360`（BigInt で厳密に計算、累積誤差なし）, `x[n] = x[n−1] + cos(φ[n]/180 × π) × distance`                     |
| **04 Two-Arm Rotation**  | `θ₁ = (n × dt) mod 2π`, `θ₂ = (n × dt × C) mod 2π`（BigInt で厳密）, `x[n] = scale × (r1·cos θ₁ + r2·cos θ₂)` — 参照動画の候補規則            |

C は選択中の定数（既定 π）。詳細は [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md)。

> いずれも数字を図形へ変換する **恣意的な規則の一例** です。「π 本来の形」ではありません。

Inspector には、実行された式そのもの（表示用に別途書かれた式ではなく、評価に使われた同じ式木）と、
代入後の式・float64 の値がそのまま表示されます。例: `angle = digit / 10 × 2π = 9 / 10 × 2π = 5.654866776461628`

## 機能

- **Timeline**: 任意 step へ移動。過去へは再計算なしで表示だけ戻し、未計算の先へは計算して進む
- **クリックで遡る**: Canvas 上の円・点・線をクリックすると、その step の digit・式・値を Inspector に固定表示
- **Presets**: Pi Walk / Pi Circle Chain / Pi Flower / Pi Orbit / Pi Spiral（名前はラベル、説明に規則を明記）
- **History**: 状態をブラウザ（localStorage）に保存し、復元時に再計算してジオメトリの SHA-256 一致を検証
- **JSON Export / Import**: 設定・step 数・式・ジオメトリの SHA-256 を含む再現可能な記録。Import すると再計算して **ビット単位で一致するか検証** し、結果（✓ / ✗）を表示
- **PNG / SVG / CSV Export**: 表示中の画像、または Timeline 位置までの図形（SVG・CSV は float64 の値をそのまま出力）
- **Infinite Mode（Continuous computation）**: 桁を使い切る前に倍の桁数を裏で計算して継続（最大 1,000,000 桁）。延長した桁は既存の桁と一致することを検査し、途中で過去が変わることはない
- **Compare Mode**: 同じ実験・パラメータ・精度を別の定数（例: π と e）で並べて、同じ step で揃えて実行。片方の図形をクリックすると両方で同じ step を表示
- **モバイル**: キャンバス優先の 1 画面レイアウト、Setup / Inspector は下から出るシート、2 本指でピンチズーム
- **Film mode / Glow**: 参照動画の見た目（白い光の線、腕なし、全画面、加速する再生）。キャンバス右上の Glow で通常の実験にも白い光の表示を使える（表示のみで、データは変わらない）
- **Formula Playground（Experiment 05）**: ANGLE / RADIUS / DISTANCE を式で入力すると即座に再計算。入力した式は実行される式木そのものとして Inspector に表示
- **Reference Reconstruction**: 参照動画（`docs/reference/`）を候補の式と比較し、一致しない候補を棄却（`tools/reference/analyze.py` → `docs/reference/ANALYSIS.md`）。動画は花の段階で 15 回対称が出てその後消える — これと矛盾しないのは速さの比 π（とこの動画では区別できない 355/113）だけ
- **Patterns（計測）**: 表示中の図形の重心・広がり・回転対称性（有意性つき）・出発点への回帰・消費した桁の頻度と χ² を計算
- **AI Observer（DeepSeek）**: 計測した事実を DeepSeek に渡し、「観測（事実の言い換え）」と「推測（未検証）」を分けて回答させる。回答は常に「AI の推測（未検証）」として表示。API キーは利用者が入力し、このブラウザにだけ保存（エクスポートや履歴には含めない）。ブラウザから DeepSeek に直接届かない環境（CORS など）では、接続先 URL を中継サーバーに変更できる
- **描画**: 既定は GPU インスタンス描画（SDF）。20 万オブジェクトで JS メモリ +0.7 MB（テッセレーション方式は +147 MB）。Scientific Mode で切り替え可能

## 使い方

```bash
npm install
npm run dev          # http://localhost:5173
```

| 操作                                             |                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| ▶ / ⏸ (Space)                                    | 再生 / 一時停止                                                      |
| ⏭ (→)                                            | 1 ステップ実行                                                       |
| ⏮ (R)                                            | リセット                                                             |
| 1x / 10x / 100x / 1,000x / MAX                   | 10 / 100 / 1,000 / 10,000 steps/s / 可能な限り速く                   |
| ∞ Infinite                                       | 桁を使い切ったら追加で計算して続ける（最大 1,000,000 桁）            |
| Timeline / `go to step`                          | 過去の状態を表示（再計算なし）、または指定 step まで計算             |
| ホイール / ドラッグ / ダブルクリック             | ズーム / パン / その位置を中心に                                     |
| 2 本指（スマホ）                                 | ピンチでズーム・移動                                                 |
| Canvas の図形をクリック / Inspector の `Inspect` | その step を再実行して digit・式・値を表示                           |
| Fit All                                          | 全体表示 + 自動追従                                                  |
| Compare                                          | 別の定数で同じ実験を並べて、同じ step で揃えて実行                   |
| Preset / History                                 | 組み込み設定の読み込み / 状態の保存と復元（復元時に SHA-256 で検証） |
| Export JSON / PNG / SVG / CSV, Import JSON       | 再現可能な記録・画像・図形データ / 読み込んで再計算・検証            |
| Scientific Mode                                  | アルゴリズム・精度・計算時間・FPS・演算の種類・描画方式を表示        |

定数は π / e / √2 / φ、Precision は 100 / 1,000 / 10,000 / 100,000 桁。計算した桁を使い切ると停止し、その旨を表示します（桁を捏造して続けることはしません）。Infinite Mode では、実際に追加で計算した桁で続けます。

## 数学的真正性の方針

- π は **BigInt による Chudnovsky 級数 (binary splitting)** で計算。要求桁 +20 桁の guard digits で計算し、**切り捨て** で確定（丸めない）。
- 誤差上界の範囲全体が同じ桁に切り捨てられる場合のみ採用し、表示される全桁の正しさを保証（guard digits を自動で拡張）。
- 検証: π / e / √2 / φ を外部参照値（各 10,000 桁）と照合、π は独立アルゴリズム（Machin の公式）とも照合、開発時に π を 1,000,000 桁まで外部参照と一致を確認。
- 図形計算は **IEEE-754 float64**。そのことを UI（Scientific Mode）とドキュメントに明記しています。式中の `π` は float64 の最近接値 `3.141592653589793` です。
- `sin` / `cos` は fdlibm を移植した **決定的実装**（`Math.sin` はブラウザ間で最終ビットが異なり得るため）。
- 乱数は使用しません。同じ条件なら、どの環境でも **ビット単位で同じ図形** になります（テストで保証）。

詳しくは [docs/MATHEMATICS.md](docs/MATHEMATICS.md)。

## 開発

```bash
npm run test        # unit tests (Vitest)
npm run test:e2e    # E2E (Playwright, Chromium)
PW_ALL_BROWSERS=1 npx playwright test   # Firefox / WebKit も（CI で実行）
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
