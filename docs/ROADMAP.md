# Roadmap

## v0.1 — 垂直スライス ✅

π を任意精度計算 → 数字列 → Digit Circle Walk → WebGL 描画 → Play / Pause / Step → 現在の桁と式の表示。

### Definition of Done v0.1

| #   | 条件                                 | 状態 | 根拠                                                               |
| --- | ------------------------------------ | ---- | ------------------------------------------------------------------ |
| 1   | π を実際に任意精度計算できる         | ✅   | `src/math/algorithms/chudnovsky.ts`, `tests/unit/math/pi.test.ts`  |
| 2   | π の各桁を順番に読み出せる           | ✅   | `ExperimentRunner`, DigitStream                                    |
| 3   | 1 桁ごとに 1 step 実行できる         | ✅   | `tests/unit/experiments/digit-circle-walk.test.ts`, E2E            |
| 4   | step から図形が生成される            | ✅   | GeometryInstruction / GeometryBatch                                |
| 5   | Play / Pause できる                  | ✅   | E2E                                                                |
| 6   | 描画速度を変更できる                 | ✅   | 1x / 10x / 100x / 1,000x / MAX                                     |
| 7   | 現在 step が分かる                   | ✅   | Status strip, Inspector                                            |
| 8   | 現在 digit が分かる                  | ✅   | Status strip, DigitStream ハイライト                               |
| 9   | 使用数式が見える                     | ✅   | FormulaViewer（式木から生成、代入形と値つき）                      |
| 10  | Canvas を zoom / pan できる          | ✅   | ホイール / ドラッグ / ダブルクリック / Fit All                     |
| 11  | Reset できる                         | ✅   | E2E                                                                |
| 12  | 同じ条件なら完全に同じ図形になる     | ✅   | `tests/unit/simulation/determinism.test.ts`（バイト比較）, detmath |
| 13  | π 計算の unit test が通る            | ✅   | `npm test`                                                         |
| 14  | 数学処理と Renderer が分離されている | ✅   | Worker 分離、Renderer は GeometryBatch のみ受け取る                |
| 15  | README から実験内容が理解できる      | ✅   | README.md, docs/EXPERIMENTS.md                                     |

性能目標「10,000 objects @ 60fps」は実 GPU 環境での確認が必要（開発コンテナはソフトウェア WebGL）。

## v0.2 — 実験の拡充 ✅

| 項目                                                     | 状態 | 根拠                                                                                             |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| Experiment 02 Circle Chain                               | ✅   | `src/experiments/circle-chain/`, `tests/unit/experiments/circle-chain.test.ts`                   |
| Experiment 03 Pi Rotation（BigInt による厳密な角度剰余） | ✅   | `src/experiments/pi-rotation/`, `src/math/exactReduce.ts`, `tests/unit/math/exactReduce.test.ts` |
| 定数 e / √2 / φ（表示桁の正しさを保証）                  | ✅   | `src/math/constants/`, `tests/unit/math/constants.test.ts`                                       |
| Timeline（過去の表示・先への計算）                       | ✅   | `src/components/Timeline/`, E2E                                                                  |
| Canvas クリック → Inspector                              | ✅   | `PixiRenderer.pick`, E2E                                                                         |
| Presets（仕様 §24 の JSON 形式）                         | ✅   | `src/lab/presets.ts`                                                                             |
| History（localStorage、復元時に digest 検証）            | ✅   | `src/lab/history.ts`, E2E                                                                        |
| JSON Export / Import（SHA-256 による再現検証）           | ✅   | `src/lab/experimentFile.ts`, `src/geometry/digest.ts`, E2E                                       |

設計メモ: クリック判定は空間索引ではなく線形走査にした（20 万レコードでもクリック 1 回あたり数 ms）。1M objects 規模では v0.3 でグリッド索引を追加する。

## v0.3 — スケールとモバイル ✅

| 項目                                                       | 状態 | 根拠                                                      |
| ---------------------------------------------------------- | ---- | --------------------------------------------------------- |
| SDF インスタンス描画（既定）+ Graphics フォールバック      | ✅   | `src/renderer/layers/`, E2E（両方式で同じ図形）           |
| クリック判定の空間索引（チャンク外接矩形）                 | ✅   | 100 万レコードで 43 ms → 0.13 ms, `geometryStore.test.ts` |
| Infinite Mode（Continuous computation、最大 1,000,000 桁） | ✅   | `continuous.test.ts`, E2E（延長後の Export を再現検証）   |
| Compare Mode（ロックステップ）                             | ✅   | E2E                                                       |
| モバイル（Bottom Sheet、1 画面、ピンチ）                   | ✅   | E2E（390×844 タッチ）, `camera.test.ts`                   |
| PNG / SVG / CSV Export                                     | ✅   | `exporters.test.ts`, E2E                                  |
| Firefox / WebKit での E2E（エンジン間の決定性）            | ✅   | CI `cross-engine` ジョブ                                  |

### 実機でのみ確認できること

- 実 GPU でのフレームレート（10,000 / 100,000 / 1,000,000 objects）
- スマートフォンでの操作感（ピンチ、シート）、発熱・電池
- iOS Safari 実機（WebKit エンジンでの一致は CI で確認）

## v0.4 — 研究機能（進行中）

| 項目                                                                     | 状態                      | 根拠                                                                                     |
| ------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| Experiment 04 Two-Arm Rotation（`modTau` による厳密な角度）              | ✅                        | `src/experiments/two-arm/`, `tests/unit/experiments/two-arm.test.ts`                     |
| Reference Reconstruction（参照動画との比較・棄却）                       | ✅                        | `tools/reference/analyze.py`, `docs/reference/ANALYSIS.md`                               |
| Pattern Detection（計算で求める事実、有意性つき）                        | ✅                        | `src/analysis/patterns.ts`, `patterns.test.ts`（Two-Arm の 15 回対称の出現と消失を検出） |
| AI Observer（DeepSeek、推測として分離表示、キーはブラウザのみ）          | ✅（実 API は未接続確認） | `src/ai/deepseek.ts`, `deepseek.test.ts`, E2E（応答を差し替え）                          |
| Experimental Playground（式パーサ）、Mathematical Microscope、MP4 / WebM | 次                        |                                                                                          |

## v0.4+ — 研究機能

- Experimental Playground（式パーサ → Formula AST。表示 = 実行の原則はそのまま）
- Mathematical Microscope（step 範囲の拡大表示）
- Pattern Detection（周期性・対称性・密度・クラスタ）
- Reference Reconstruction（候補式の実行と比較、検証されるまで「再現」と断定しない）
- AI Mathematical Observer（AI の推測と数学的証明を明確に区別して表示）: DeepSeek API（OpenAI 互換）。キーは利用者が入力し、その端末のブラウザにだけ保存（サーバー不要・アプリに埋め込まない）
- Reference Reconstruction の素材: 動画をリポジトリの `reference/` に置いてもらい、フレームを切り出して配置規則を推定する
- MP4 / WebM Export、クラウド保存
