# Architecture

```
[math.worker]                         [simulation.worker]                     [main thread]
ConstantEngine ──digits (Uint8Array)──▶ Simulation / ExperimentRunner ──GeometryBatch──▶ GeometryStore ─▶ PixiRenderer
  Chudnovsky (BigInt)                     Experiment.step()   (Float64Array)    (append-only)     Camera
                                          checkpoints (every 1,000 steps)          ▲
                                          inspect(step) ────── StepTrace ─────────▶ Inspector / FormulaViewer (React + Zustand)
```

## レイヤー

| レイヤー                     | 場所                                        | 責務                                 | 知らないこと |
| ---------------------------- | ------------------------------------------- | ------------------------------------ | ------------ |
| Math Engine                  | `src/math/`                                 | 定数の任意精度計算、決定的 sin/cos   | 図形・描画   |
| Experiment / Geometry Engine | `src/experiments/`, `src/geometry/`         | digit → 式 → GeometryInstruction     | 描画・UI     |
| Simulation                   | `src/simulation/`, `src/workers/`           | 再生クロック、バッチ化、フロー制御   | 描画・UI     |
| Render Model                 | `src/geometry/GeometryStore.ts`             | 受信した全図形のチャンク保存、bounds | 数学         |
| Renderer                     | `src/renderer/`                             | WebGL 描画、カメラ、入力             | 数学         |
| UI                           | `src/components/`, `src/state/`, `src/app/` | 表示と操作                           | 数学の実装   |

## Experiment System

`src/experiments/core/types.ts`

```ts
interface GeometryExperiment<S> {
  initialize(config: ExperimentConfig): void
  step(context: StepContext, trace?: TraceSink): StepResult // { instructions, env }
  snapshot(): S // チェックポイント用（structured-clonable）
  restore(state: S): void
  reset(): void
}
interface StepContext {
  index
  digit
  digitPosition
  previousDigits: DigitView
  constant
}
```

- `ExperimentDefinition` は `parameters`（UI 自動生成用スキーマ）、`formulas`（式木）、`symbols`（表示名）、`create()` を持つ。
- 実験は数値を **必ず `runFormulas()` 経由で式木を評価して** 得る。`trace` が渡されたときだけ代入式の文字列を生成するため、通常実行ではオーバーヘッドがない。
- `ExperimentRunner` は step n (1 始まり) に digit[startOffset + n − 1] を与え、1,000 step ごとに `snapshot()` を保存する。
  `inspect(step)` は最寄りのチェックポイントから **別インスタンスで再実行** して `StepTrace` を返す。全 step の trace を保持しないので、メモリは step 数に比例しない（チェックポイントのみ）。

## Formula AST

`src/experiments/core/formula/`

- ノード: `num`, `var`, `pi`, `bin(+ − × ÷ mod)`, `neg`, `call(sin|cos)`
- `evaluate()` — float64 評価（sin/cos は `detmath`）
- `renderExpr()` — `digit / 10 × 2π` 形式の表示、`values` を渡すと代入形 `9 / 10 × 2π`
- 将来の Experimental Playground（ユーザーが式を編集）は、この AST へのパーサを追加するだけで成立する。

## Worker とメッセージ

`src/workers/protocol.ts` に判別共用体で型定義。

- **math.worker**: `compute(constantId, precision)` → `result(digits: Uint8Array, value, algorithm, computeTimeMs)`（transfer）
- **simulation.worker**: `init / play(stepsPerSecond) / pause / step(count) / reset / setSpeed / inspect(step) / ack`
  → `ready / batch / status / reset / inspect / error`
- 再生: 16 ms ごとの tick で、速度 × 経過時間分の step を実行（端数は持ち越し）。MAX は 1 tick あたり最大 20,000 step・10 ms の時間予算。
- フロー制御: 未 ack のバッチが 2 つ以上あれば次の tick を見送る（Renderer が追いつけない速度で溜め込まない）。
- **時間は「1 フレームで何 step 実行するか」だけを決め、「何を計算するか」には影響しない**（テスト済み）。

## GeometryBatch

`src/geometry/batch.ts` — 1 レコード = float64 × 7 `[kind, step, a, b, c, d, e]`。Worker → main は `Float64Array` を transfer。float32 への丸めは GPU に渡す直前まで行わない。

## Renderer

`src/renderer/PixiRenderer.ts`（`Renderer` interface を実装）

- 図形の GPU 化は `GeometryLayer`（`src/renderer/layers/`）が担当し、カメラ・入力・ピッキング・ハイライトは共通。
  - **InstancedLayer（既定）**: 円・点・弧・線を 1 オブジェクト = 1 インスタンスの四角形として描き、フラグメントシェーダで 1px のリング・点・アンチエイリアス線を解析的に塗る。テッセレーションしない。16,384 レコード単位の GPU チャンクで、追記中のチャンクだけ再転送する。
  - **GraphicsLayer（フォールバック）**: Pixi の `Graphics` を 2,000 レコード単位で構築（v0.2 までの方式）。Scientific Mode で切り替え可能。
  - 実測（200,000 オブジェクト）: JS ヒープ増加 Instanced +0.7 MB / Graphics +147 MB。
- 描画は加算合成（重なりが淡く発光）。現在 step / Inspect 中の step はアクセント色でハイライト。
- **float32 対策**: GPU 頂点は float32 のため、チャンクは「ビュー付近の原点からの相対座標 × 2 のべき乗のズームバケット」で構築し、ズームがバケットの 0.5〜2 倍を外れるか、原点から画面 10⁶ px 以上離れたら再構築する。world 座標自体は float64 のまま。
- **オンデマンド描画**: 図形・カメラ・ハイライトが変化したフレームだけ `app.render()` を呼ぶ。Scientific Mode の FPS は「直近 1 秒に実際に描画したフレーム数」。
- **Timeline**: `setVisibleStep(n)` で step ≤ n のレコードだけを表示する（`GeometryStore.countUpToStep` の二分探索。境界のチャンクだけ再構築）。過去への移動は再計算しない。未計算の先への移動は worker に `step(count)` を送る。
- **Picking**: クリック位置から許容 6px 以内の図形を探す（円は円周または中心、線は線分への距離。円・点を線より優先）。`GeometryStore.chunkBounds`（2,000 レコードごとの外接矩形）で遠いチャンクを飛ばす。連続する step は空間的に近いため、100 万レコードで 43 ms → 0.13 ms（全走査と同じ結果になることをテスト）。
- **入力**: マウス（ホイール・ドラッグ・ダブルクリック）とタッチ（1 本指でパン、2 本指でピンチ `Camera.pinch`）。2 本目の指が触れた操作はクリックとして扱わない。
- ResizeObserver でホスト要素のサイズ変化時に `app.resize()` を呼ぶ（Pixi の `resizeTo` はウィンドウのリサイズにしか反応しないため。v0.1 ではレイアウト変化後に描画中心がずれていた）。
- Camera（`Camera.ts`）: world（y 上向き）↔ screen。ホイールはカーソル位置固定ズーム、ドラッグでパン、ダブルクリックで中心移動、Fit All で bounds に合わせ自動追従。

### 性能メモ

| 項目                          | 実測（開発コンテナ、ヘッドレス Chromium）  |
| ----------------------------- | ------------------------------------------ |
| π 100,000 桁                  | ~0.1 s（Node）/ ~0.13 s（ブラウザ Worker） |
| π 1,000,000 桁                | ~2 s（Node）                               |
| 10,000 step（MAX, 描画込み）  | ~1.8 s                                     |
| 100,000 step（MAX, 描画込み） | ~7.5 s                                     |

ヘッドレス環境の WebGL はソフトウェアラスタライザ（SwiftShader）であり、描画時間は実 GPU より桁違いに遅い。
**フレームレート（10,000 objects @ 60fps、100 万 objects）は実 GPU 環境で確認すること**（Scientific Mode の `Renderer FPS` と `Geometry layer`）。メモリ・構築コスト・クリック判定はこの環境で測定済み（上記）。

### CI（エンジン間の決定性）

GitHub Actions で同じ E2E を Chromium（V8）に加えて Firefox（SpiderMonkey）と WebKit（JavaScriptCore、Safari のエンジン）で実行する。
Node で固定したジオメトリの SHA-256 とブラウザでの Export が一致することを確認するテストを含むため、3 つの JS エンジンでビット単位の一致を検証できる。

## Infinite Mode（Continuous computation）

- 使用 step が桁数の半分を超えたら、`nextPrecision`（2 倍、最低 10,000、上限 1,000,000）で同じ定数を math.worker に再計算させる。
- 結果は **既存の桁で始まること** をコントローラと `ExperimentRunner.extendDigits` の両方で検査し、simulation.worker に渡す（`extend`）。計算済みの状態・チェックポイントはそのまま使う。
- 再生が追いついた場合、worker は停止せず `waiting` 状態で待ち、桁が届くと再開する。
- 上限はジオメトリのメモリで決めている（1 step あたり float64 × 7 × 2 レコード ≈ 112 バイト、100 万 step で ≈ 112 MB）。

## Compare Mode

- `LabController` はストアを引数に取る。Compare Mode では 2 つ目の `LabController`（独自の worker・renderer・ストア）を作り、実験・パラメータ・精度・読み始め位置をメインから反映する。
- 再生はメインスレッドの時計が両方に `seekTo(target)` を送り、両方が target に到達してから次へ進む（ロックステップ）。どちらのレーンも常に同じ step にいる。
- 片方でクリックした step を両方で inspect する（同じ step・別の定数の比較）。

## Lab 機能（`src/lab/`）

| モジュール           | 役割                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`          | `LabConfig`（constant / precision / experiment / digitStart / parameters）と、外部入力（JSON・localStorage）の検証。未知のキーや範囲外の値は拒否する |
| `presets.ts`         | 組み込み Preset                                                                                                                                      |
| `history.ts`         | localStorage 上の履歴（壊れたエントリは信頼せず捨てる）                                                                                              |
| `experimentFile.ts`  | Export 形式 `pi-infinite-lab/experiment` v1 と Import の解析（完全な記録と、仕様 §24 形式の素の Preset の両方を受け付ける）                          |
| `exporters.ts`       | CSV / SVG（float64 の値をそのまま出力）                                                                                                              |
| `geometry/digest.ts` | ジオメトリの SHA-256（WebCrypto がない環境では純 JS 実装）                                                                                           |

## ディレクトリ

```
src/
  app/            App.tsx, LabController.ts（Worker・Renderer・Store の配線、seek / import / verify）
  lab/            config, presets, history, experimentFile
  math/           constants/ (pi, e, sqrt2, phi, certain, registry), algorithms/ (chudnovsky, eSeries, machin),
                  precision/ (bigint, fixed), detmath.ts, exactReduce.ts
  experiments/    core/ (types, Experiment, ExperimentRunner, formula/), digit-circle-walk/, circle-chain/, pi-rotation/, registry.ts
  geometry/       types.ts (instructions), batch.ts (encoding), GeometryStore.ts, digest.ts
  simulation/     Simulation.ts（再生クロック）
  workers/        math.worker.ts, simulation.worker.ts, protocol.ts
  renderer/       Renderer.ts, PixiRenderer.ts, Camera.ts, hitTest.ts, layers/ (GeometryLayer, InstancedLayer, GraphicsLayer)
  components/     Canvas, Compare, Controls, Timeline, DigitStream, Inspector, FormulaViewer, Panel, History, Status
  state/          labStore.ts (Zustand)
  utils/          format.ts
tests/
  unit/           math, experiments, simulation, renderer
  e2e/            Playwright
  fixtures/       pi / e / sqrt2 / phi 各 10,000 桁（外部参照値）
```
