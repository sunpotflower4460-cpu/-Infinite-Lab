# 同じトーラス上の半透明の第3軌跡

[第3を明るくした画像・計算レビュー・太線の色補正](THIRD_FLOW_REVIEW.md) を追加。以下の画像とテスト数は初期実装時の記録。

陰陽の2本を残し、同じ1つの立体トーラスの上に、第3の観察軌跡を薄い紫で重ねる。3つの別のドーナツを配置する実験ではない。初期状態は従来通り第3オフで、明示的に選ぶと追加する。

## 定義と精度

```text
T(u,v) = ((R+r cos v) cos u, (R+r cos v) sin u, r sin v)
u=t=n·dt, v=Ct, Cは既定でπ
陰    P=T(u,v)
陽   −P=T(u+π,−v)
第3   Q=T(u+σπ/2,v)=(−σy,σx,z), σ=±1
```

Pの角度は既存の448-bit / 約120桁の定数、BigIntによる還元、detSin / detCosで計算する。Qは計算済みのx/yの交換と符号変更だけで、別の三角関数の近似は加えない。`Qx²+Qy²=x²+y²`、`Qz=z` なので、Pが満たすトーラスの陰関数恒等式をQも満たす。

```text
(x²+y²+z²+R²−r²)² = 4R²(x²+y²)
```

位相±90°は追加した観察規則であり、πだけから第3の流れが必然的に生じるという意味ではない。3本目も同じ速度比の軌跡で、独立した第3の周波数や物理的エネルギーの計算は導入していない。参照画像の3つ葉を形として仕込むこともない。元の陰陽の2本は中心対称のまま、3本全体の中心対称性は保証しない。

数学テスト15件を追加。π / 22⁄7、リング / ホーン / スピンドル / 球・円・点への退化、n=1 / 300 / 1,000 / 10,000 / 10¹² / 2⁵³−1 / 10³⁰、位相±90°を検証する。元の陰陽の座標和0、Qの半径・z不変、逆変換、3D行列とExportの座標一致、面の正規化残差 `<4×10⁻¹⁵` を確認した。以前の独立190桁Torus参照テストも維持する。

座標はfloat64、GPU描画はfloat32。結んだサンプル間は直線で、全ての線分の途中まで面上にあるとは主張しない。補助面は同じR/rのパラメトリックな三角形メッシュで、計算データとは区別する。

## 操作と保存

1. Film / Labの **形 → Torus → 第3の流れを半透明で表示**。陰陽がオンになり、P・−P・Qを表示する。
2. 穴の開いたドーナツなら **調整 → 穴あり 腕1=1.3, 腕2=1**。元Filmの腕長1・1のままならホーンとなる。
3. **Trail → 300** などで短い流れを観察する。調整から第3の濃さ0〜100%（既定23%）、位相±90°、第3のみ／3本全てを切り替える。
4. **トーラス面を薄く表示（補助）** で流れの乗る面を確認する。真上／斜め、ドラッグ、2本指で立体を観察できる。

濃さ0では第3の軌跡・選択マーカーを描かず、選択対象からも除外する。クリックするとInspectorに `third`、元のstep、変換後Q、元Pを表示する。Solo / Mirrorへ戻すと第3はオフ。他の形では表示せず、Torusへ戻ると保存した設定を使う。

- JSON v5 / History: 濃さ・位相・表示対象・補助面・カメラを保存。v1〜v4も読み込み、設定がなければ第3オフ。
- geometrySha256 / geometryRecords: 元の1step=1pointだけ。位相や表示切替では変化しない。
- CSV: `flow=original/derived/third` で区別し、元のstepとfloat64座標を出力する。Trail / Microscopeの範囲を使う。
- SVG: x/yへの正射影で、同じ位相変換と第3の濃さを反映。追加規則をdescに記録する。
- PNG / 動画: 現在の描画と補助面を含む。CSV / SVG / digestに補助面は含まない。動画後は表示stepと視点を復元する。

## 実画面と負荷

1440×960 / 390×844、300 / 1,000 / 10,000 step、Trail 300、第3のみ、調整欄を実際のブラウザで撮影。pageerror / console errorは0件。カメラ操作は実測した説明欄の下へ配置し、長い調整欄はスクロールできる。

- [3本を重ねたデスクトップ](third-flow/desktop-1000.jpg) / [390×844](third-flow/mobile-1000.jpg)
- [半透明の第3のみ＋補助面](third-flow/desktop-third-only.jpg)
- [スマホの調整欄](third-flow/mobile-options.jpg)
- [アプリから保存したPNG](third-flow/torus-third-flow.png)
- [アプリから保存した2秒MP4](third-flow/torus-third-flow.mp4)
- [撮影・GPU共有の記録](third-flow/capture.json) / [動画保存前後の状態](third-flow/video-restore.json)

MP4はH.264、1036×692、2秒。計算済step=10,000、表示step=1,000を維持。視点の座標差はOrbitControlsによる再正規化の丸め（最大約2.3×10⁻¹³）で、表示設定・カメラtarget・投影方式・zoomは保持する。E2Eでは元データdigestも照合する。

1,000 / 10,000 / 100,000の表示stepで第3のオン／オフを比較した。3Dのnative線・太線はどちらも元と第3が同じgeometryを参照し、GPUのgeometry数は5のまま。描画callは6→7、元の記録数は変化しない。表示1,000の時の元記録10,000は先行計算の結果であり、3本分の複製ではない。表示100,000では元記録も100,000。実GPUのFPSをこのソフトウェア描画環境から推定してはいない。

## 検証結果（2026-11-13 UTC）

| 項目                     | 結果                      |
| ------------------------ | ------------------------- |
| typecheck / lint / build | PASS                      |
| 単体テスト全体           | 32 files / 438 tests PASS |
| Chromium E2E全体         | 50 / 50 PASS              |
| WebGL無効 E2E全体        | 50 / 50 PASS              |
| 実画面・PNG・MP4         | 成功、ブラウザエラー0     |

E2E追加3件は、3本のCSV座標と面の式、元digest不変、JSON / History、位相変更、単独表示、実際の紫の画素の選択とInspector座標、濃さ0で消えること、PNG / MP4と保存後の復帰、390×844のタッチ・調整欄・カメラ位置、他の形への切替を検証する。実物のiPhone / Safari、実GPUのFPSは未実施。Firefox / WebKitはPRのCIで別途実行する。

```sh
npm run typecheck
npm run lint
npm test
npm run build
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npx playwright test --project=chromium --workers=2
PW_NO_WEBGL=1 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npx playwright test --project=chromium-no-webgl --workers=2
# Viteを4175で起動後に画像と動画を再生成
node tools/validation/third-flow.mjs
```
