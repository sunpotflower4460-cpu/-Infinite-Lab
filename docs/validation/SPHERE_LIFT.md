# Sphere Lift / Mirror / Yin–Yang 検証記録

## 着手時監査

- main = `6dc993b`（指示書の基準と一致）。新規checkoutに未コミット変更なし。作業ブランチで実装、mainへマージしない。
- CLAUDE.mdと指定の数式／構成／実験資料、参照動画の抽出フレーム、添付のFilm動画を確認。
- 2Dは1step=1line、3Dは1step=1point。storeのレコードを2倍にするとstep対応・digest・3D連結が壊れるため、描画側の変換を採用。
- 半位相は還元済みの角度の差から作らず、C−1の448-bit係数から直接還元。x/yは既存式木を共有。
- 主な互換性リスクは形の切替時のworker再初期化、カメラ復元、GPU資源、旧JSON。数学→派生表示→保存→E2Eの順に検証。

## 再実行

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2
# WebGL不可の経路
PW_NO_WEBGL=1 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/v06.spec.ts tests/e2e/sphere-lift.spec.ts --project=chromium-no-webgl --workers=1
```

画像／負荷の再現は開発サーバーを4173で起動し、`node tools/validation/sphere-lift.mjs`。基準mainを4174で起動すると `node tools/validation/benchmark.mjs` で同じTorusを比較できる。測定はヘッドレスChromium / SwiftShader（CPU描画）。実機GPUやiPhoneの速度を示すものではない。

## 数学・互換性・操作

- Sphere Liftの追加テスト44件：π / 22⁄7 × dt=0.0001 / 0.05 / 0.137 / 1 × 等長・不等長・片腕ゼロ・両腕ゼロ、複数stepでx/yの同一性と球面残差を検査。
- 正規化球面残差の許容値3×10⁻¹⁵。n=10⁶ / 10¹² / 2⁵³−1 / 10³⁰と独立190桁Decimal参照、C<1の符号を確認。
- Mirrorの座標関係と陰陽の座標和0、ASTのrender→parse、旧digestの固定値、v1〜v3 Import、v4設定復元、CSV / SVGが元store・digestを変えないことを検査。
- E2EはFilmから形／モード切替、step復帰、ポーズ、正射影カメラの保存、回転ドラッグ、派生線選択とInspector、PNG / MP4、カメラとstepの復帰、History / JSON再現、390×844のラベル配置とCDPによる2本指タッチを含む。
- native薄線の高速経路を維持。太線は50,000点未満で専用シェーダーを使用し、高密度時は画面に理由を出して細線へ戻す。表示上の品質調整であり、元座標と保存記録を削除しない。
- 数式は正確でも、サンプル間は直線の弦。帯域・有限サンプル・GPU float32の限界は画面／実験資料に明記。鏡映／中心反転は人為的変換として説明し、S字や点の装飾は実装しない。

## 実画面

1440×960と390×844で、2D / Sphere × Solo / Mirror / Yin–Yang × 300 / 1,000 / 10,000 step、計36枚を生成し、配色、詰まり、奥行き、ラベルと保存／説明ボタンの配置を確認。スクリーンショットは実際の計算・描画から保存したもの。

- [2Dの比較一覧](sphere-lift/2d-contact-sheet.jpg)
- [Sphereの比較一覧](sphere-lift/sphere-contact-sheet.jpg)
- [Sphere + 陰陽・1,000 step（デスクトップ）](sphere-lift/desktop-Sphere-1000-yin-yang.jpg)
- [Sphere + 陰陽・1,000 step（390×844）](sphere-lift/mobile-Sphere-1000-yin-yang.jpg)
- [Sphere + 陰陽・2秒のMP4書き出し](sphere-lift/sphere-yin-yang.mp4)

300 stepではまだ疎な曲線、1,000 stepでは半球の奥行きと対、10,000 stepでは密な交差が見える。密度の高い部分の重なりは隠さず、Trail・透明度・片側表示で観察できる。既定のFilm Soloの白い発光は維持し、対のモードでは合成を抑えて色を判別しやすくした。

## 負荷比較

同一環境・同じTorus・同じ表示サイズ1000×800。基準main `6dc993b` と変更後のSoloを比較。各段階の前のstepから追加計算した時間、12回のPNG保存（描画＋GPU読戻し＋PNG圧縮）の中央値。ブラウザのスケジューリング・GCで変動するため、FPSの保証値ではない。

| 計算済step | main計算 ms | 変更後計算 ms | main PNG ms | 変更後PNG ms | 元Geometry |
| ---------- | ----------: | ------------: | ----------: | -----------: | ---------: |
| 1,000      |          35 |            38 |        16.7 |         16.7 |      56 KB |
| 10,000     |          53 |            63 |        48.0 |         20.7 |     560 KB |
| 100,000    |         224 |           237 |       116.5 |        131.0 |     5.6 MB |

100,000で計算+6%、PNG+12%。元Geometryのメモリは変わらない。ブラウザ全体のJSヒープは基準約66.6 MB、変更後約71.6 MB（GC時点に依存）。追加モードのためにsourceレコードを倍にしない。2流れでは描画する線が増える分のGPU負荷がある。

[測定生データ](sphere-lift/baseline.json) / [Sphere各モードの測定](sphere-lift/measurements.json)。後者の1,000 step表示時は既に10,000点を保持しており、表示範囲と保存メモリを区別して記録している。

## この環境で未確認の項目

- 実物のiPhone / Safariでの操作、実GPUの連続FPS：この環境はLinuxのChromium / SwiftShader。390×844と2本指操作を自動検証し、実機の代替とした。実機Safariの性能やエンコーダの品質は保証しない。
- Firefox / WebKitの全E2E：この作業環境ではChromiumで実行。既存のCIの複数エンジン設定は維持。浮動小数点の決定性は既存のfdlibm実装とdigest回帰テストで検査。

## 最終チェック（2026-11-12 UTC）

| 項目                            | 結果                                |
| ------------------------------- | ----------------------------------- |
| npm run typecheck               | PASS                                |
| npm run lint                    | PASS                                |
| npm test                        | 30 files / 372 tests PASS           |
| npm run build                   | PASS（既存の500 KB超chunk警告あり） |
| Playwright Chromium・全スイート | 45 / 45 PASS                        |
| WebGL無効・Sphere + v0.6 3D     | 7 / 7 PASS                          |
| 静的差分チェック                | git diff --check PASS               |

最終版で全項目を確認。途中で検出したFilm初期カメラ、太線の高密度負荷、対の色飽和、カメラ投影方式の問題は修正後に再確認した。環境再起動で中断したプロセスは検証結果に含めず、起動後に再実行した。ビルドで配信ディレクトリを更新中に発生したHTTPエラーも、ビルド完了後の安定したpreviewサーバーで再実行して解消を確認した。
