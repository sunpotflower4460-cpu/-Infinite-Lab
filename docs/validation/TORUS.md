# Torusの追加検証

既存の `two-arm-torus` をそのまま利用し、Sphereと共通のSolo / Mirror / Yin–Yang、Trail、カメラ、保存と合わせて使えるよう説明と半径の操作を補強した。トーラスの座標式・演算順・1step=1point・幾何学digest・JSON形式は変更していない。

## 数学

2Dと同じ `θ₁=(n·dt) mod 2π`、`θ₂=(C·n·dt) mod 2π`。448-bit / 約120桁のCとπを使い、nとdtをfloat64の厳密な有理数値としてBigInt還元する。最後にfloat64へ戻し、detSin / detCosを用いる。πの各桁が方向を指定する方式ではなく、2本の腕の回転速度比がπ。

```text
ρ = r1 + r2·cos θ₂
(x,y,z) = scale·(ρ·cos θ₁, ρ·sin θ₁, r2·sin θ₂)
R=scale·r1, r=scale·r2
(x²+y²+z²+R²−r²)² = 4R²(x²+y²)
```

Sphere Liftと異なり、2Dと同じx/yを保持する実験ではない。既存の「第2の腕を縦に回す」変換を明示する。R>rは穴のあるリング、R=rはホーン、R<rは自己交差するスピンドル。R=0、r=0、両方0も退化として区別する。ρが負の部分も符号を保って描き、見栄えのための補正はしない。

追加の単体テスト51件：

- π / 22⁄7 × dt=0.0001 / 0.05 / 0.137 / 1 × Ring / Horn / Spindle / Sphere / Circle / Point。
- n=0 / 1 / 7 / 300 / 1,000 / 10,000 / 10⁶ / 10¹² / 2⁵³−1 / 10³⁰。
- 上記恒等式の正規化残差 `|左辺−右辺|/max(1,(R+r)⁴)<4×10⁻¹⁵`。
- R≥rでは `[(√(x²+y²)−R)²+z²−r²]/max(1,(R+r)²)` の絶対値も4×10⁻¹⁵未満。
- 鏡像・中心反転の点も同じ面を満たし、陰陽の座標和は0。
- 独立した190桁Decimal計算から得た10組の角度・座標と、n=10³⁰まで照合。
- 2Dとの角度・stepの一致、表示する式と実行結果の一致。

参照値は `python3 tools/validation/torus-reference.py` で再生成できる。Python標準のDecimalとテイラー級数を用い、JSの角度還元やdetmathを参照しない。

連続時間での稠密性と固定dtの有限サンプルは区別する。C=p/qのトーラス結び目の説明はR>rかつ連続時間についてのもの。サンプル間は直線であり、その途中も面上に載るという主張はしない。float64座標／GPU float32／有限桁の定数という限界は残る。

## 操作と保存

Film / Labの **Torus → 調整 → 穴あり 腕1=1.3, 腕2=1 → 陰陽**。元FilmからそのままTorusを選ぶと、腕長1・1を引き継いでホーンになる。明示的な半径プリセットでドーナツの穴を開ける。**穴なし 腕1=腕2=1** も比較できる。どちらも同じstepまで再計算し、dt・定数・重ね方・視点・再生状態を保持する。

Filmの「専門」では実行するTorusのASTを表示し、2D専用の複素数の式をTorusの座標式として併記しない。p/qの表も大円q周・管p周という意味を表示する。390×844で説明と回転ボタンが重ならないことをE2Eでも検査する。

追加E2Eは、Filmで半径を変更しても時刻を維持すること、式と半径表示、鏡像／陰陽でも元のdigestとstepが変わらないこと、CSVの対の座標・step・面の恒等式、JSON再現を確認する。PNG・動画・カメラ・Timeline・Microscope・History・Compareの既存テストも維持。

## 実画面・動画

1440×960 / 390×844、300 / 1,000 / 10,000 step、Solo / Mirror / Yin–Yangの18枚、Trail 300の2枚を実際の描画から保存。ブラウザのpageerror / console errorは0件。

- [各step・各モードの比較](torus/contact-sheet.jpg)
- [1,000 step・陰陽（デスクトップ）](torus/desktop-1000-yin-yang.jpg)
- [1,000 step・陰陽（390×844）](torus/mobile-1000-yin-yang.jpg)
- [10,000 stepからTrail 300だけを観察](torus/mobile-trail-300.jpg)
- [Torus・陰陽・Trail 300の2秒MP4](torus/torus-yin-yang.mp4)
- [動画保存前後のstep・カメラ](torus/video-restore.json)

動画は1036×764、H.264、2秒。保存前後の計算済step=10,000、表示step=1,000、カメラ位置・投影方式・zoomが一致することを確認。描画・保存は既存の共有バッファ／Export経路を使用し、追加した説明・分類のための全点再計算やGPUバッファの増殖はない。

実機iPhone / Safari、実GPUのFPSはこのLinux環境では未確認。390×844のChromiumとタッチ検証、既存の複数ブラウザCIを代替とする。基本描画の性能比較は [前回の同じTorusによる測定](SPHERE_LIFT.md#負荷比較) を参照。

## 再実行

```sh
npm run typecheck
npm run lint
npm test
npm run build
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2
PW_NO_WEBGL=1 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/torus.spec.ts tests/e2e/sphere-lift.spec.ts tests/e2e/v06.spec.ts --project=chromium-no-webgl --workers=1
# 画像・動画はViteを4175で起動して生成
node tools/validation/torus.mjs
```

## 検証結果（2026-11-12 UTC）

| 項目                                 | 結果                              |
| ------------------------------------ | --------------------------------- |
| typecheck / lint / build             | PASS                              |
| 単体テスト全体                       | 31 files / 423 tests PASS         |
| うち追加のTorus数学テスト            | 51 tests PASS                     |
| Chromium E2E全体                     | 47 / 47 PASS                      |
| WebGL無効（Torus / Sphere / 既存3D） | 9 / 9 PASS                        |
| 最終表示ラベルの修正後のTorus E2E    | 2 / 2 PASS                        |
| 実画面取得・動画保存                 | 成功、pageerror / console error 0 |
| git diff --check                     | PASS                              |

半径プリセットのボタンは腕長を示し、実寸の半径はそのscale倍として別表示する。実物のiPhoneは未実施。Firefox / WebKitについてはPRの既存CIの結果も確認する。
