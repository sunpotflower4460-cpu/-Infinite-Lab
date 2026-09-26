# 実機確認の依頼書（Mac + iPhone）

この文書は、手元の **Mac で起動した Claude Code** に渡す依頼書です。
Claude Code はこれを読み、上から順に実行し、結果を記録してください。人（ユーザー）に操作してもらう手順には **【ユーザー】** と書いてあります。その手順は、ユーザーに具体的にお願いし、結果を聞き取ってください。

## 目的

π Infinite Lab（v0.5.0）のうち、開発用のクラウド環境では確かめられなかった点を実機で確認します。

1. iPhone の Safari で表示・操作ができるか（起動時の π の模様、説明、実験画面、Microscope、式の入力）
2. iPhone で書き出した動画が再生できるか（H.264 が選ばれるか）
3. Mac の実 GPU でのフレームレート
4. DeepSeek（AI Observer）の実 API に届くか（任意）
5. Mac と iPhone の間で、同じ設定から同じ図形になるか（SHA-256 の一致）

## 前提

- リポジトリ：`https://github.com/sunpotflower4460-cpu/-Infinite-Lab`（`main` ブランチ、v0.5.0）
- Node.js 22（`node -v` で確認。無ければ `brew install node@22`、または nvm）
- Mac と iPhone が **同じ Wi-Fi** にあること
- まず `README.md` と `CLAUDE.md` を読むこと。参照動画の説明は `docs/reference/`、実機でのみ確認できることは `docs/ROADMAP.md` にあります。

## 守ってほしいこと

- 計算と描画の規則（式・定数・決定性）は変えないでください。このアプリの中心です。
- DeepSeek の API キーは、ファイル・ログ・コミット・PR のどこにも書かないでください。キーは **ユーザー本人が画面に入力** します。
- `main` に直接 push しないでください。記録も修正もブランチ上で行い、PR を作ります。マージはユーザーの承認後です。
- 外部に公開するトンネル（手順 3 の代替案）を使った場合は、確認が終わったら必ず止めてください。
- 分からないこと、判断に迷うことはユーザーに聞いてください。

---

## 手順 1. 準備

```bash
git clone https://github.com/sunpotflower4460-cpu/-Infinite-Lab.git   # すでにあれば: git checkout main && git pull
cd -Infinite-Lab
npm ci
npm test          # すべて passed になること
npm run build     # エラーなく終わること
```

失敗したら、その出力を記録してユーザーに報告し、先に進まずに相談してください。

## 手順 2. Mac で起動して確認

```bash
npm run dev
```

- 【ユーザー】Mac の Chrome と Safari で `http://localhost:5173/` を開いてもらいます。π の模様（Film 画面）から始まるはずです。
- 実験画面は `http://localhost:5173/#lab` で開きます（✕ でも移れます）。

## 手順 3. iPhone で開く（HTTPS が必要）

iPhone から `http://<MacのIP>:5173` で開くと「安全でない接続」になり、**動画の書き出し（WebCodecs）が使えません**（Video ボタンが無効になります）。
そのため、自己署名証明書の HTTPS で起動します。**この変更はコミットしません。**

```bash
npm install --no-save @vitejs/plugin-basic-ssl@2
cat > vite.config.https.local.ts <<'EOF'
import { defineConfig, mergeConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import base from './vite.config.ts'

export default mergeConfig(base, defineConfig({ plugins: [basicSsl()], server: { host: true } }))
EOF
npx vite --config vite.config.https.local.ts
ipconfig getifaddr en0      # Mac の LAN の IP（例 192.168.1.23）
```

- 表示される `Network: https://192.168.x.x:5173/` の URL をユーザーに伝えます。
- 【ユーザー】iPhone の Safari でその URL を開いてもらいます。「この接続ではプライバシーが保護されません」と出たら、「詳細を表示 → このWebサイトを閲覧」で進みます。
- 確認が終わったら `vite.config.https.local.ts` を削除し、`npm ci` で依存を元に戻します（`git status` が clean になること）。

**代替案**（上の方法で開けないとき）：`npx cloudflared tunnel --url http://localhost:5173` を使います（`npm run dev` を動かしたまま実行）。表示される `https://….trycloudflare.com` を iPhone で開きます。この URL は **インターネットに公開** されるので、終わったら必ず Ctrl+C で止めてください。

**iPhone 側のエラーを見る方法**：iPhone を USB で Mac につなぎ、iPhone で「設定 → Safari → 詳細 → Web インスペクタ」をオンにします。Mac の Safari で「開発 → （iPhone 名）→ ページ」を開くと、コンソールが見られます。

## 手順 4. 確認項目

各項目の結果を ✓ / ✗ / 数値 / メモで記録してください。スクリーンショットや画面収録があればファイル名も書きます。

### A. 起動時の π の模様（iPhone、縦向き）

- [ ] 開いてすぐ、白い線の π の模様が描かれ始める。時間とともに速くなり、花 → 網目 → 光る円盤になる
- [ ] 下の説明（かんたん）に `π = 3.14159…`、根元の腕と先の腕の周回、「先 ÷ 根元 = 3.14159」が出る。周回に合わせて説明文が変わる（7 周あたりで「22/7」「15 枚の花びら」）
- [ ] 上の「かんたん / 専門 / 説明なし」が切り替わる。再読み込みしても選んだものが保たれる
- [ ] 画面タップで一時停止・再開できる
- [ ] 横向きにすると説明が左、模様が右になる
- [ ] 1 分ほど動かして、カクつき・発熱・途中で止まることがないか（メモ）
- [ ] ✕ で実験画面に移り、上部の「▶ π の模様を見る」で戻れる

### B. 実験画面（iPhone、`#lab`）

- [ ] 下の「⚙ Setup」「ⓘ Inspector」がシートとして開閉する
- [ ] 2 本指のピンチで拡大縮小、1 本指のドラッグで移動できる
- [ ] Play / Pause / Step、Timeline のスライダーが操作できる
- [ ] 図形をタップすると Inspector にその step の digit と式が出る
- [ ] Microscope：Inspector の下の「±50」で、その前後だけが拡大され、左上に「🔬 steps …」が出る。✕ で戻る
- [ ] Formula Playground：Setup → Experiment で「Formula Playground」を選ぶ。ANGLE に `angle_prev + digit * pi / 5` と入力すると描き直される。`×` や `π` の代わりに `*` と `pi` が使えること。不正な式（例 `digit *`）では赤い印とエラーが出て、描画は続く

### C. 動画の書き出し

- [ ] iPhone：π の模様の画面で少し待ってから右上の「⤓ 保存」を押す。保存後に出る緑のバッジの codec（`avc` なら H.264）を記録する
- [ ] iPhone：保存した MP4 が「ファイル」アプリ（または写真）で再生できる
- [ ] iPhone：実験画面の上部「Video」→ MP4 → Record。長さ 10 秒で保存・再生できる
- [ ] Mac（Chrome）：Video で MP4 と WebM を書き出し、QuickTime（MP4）と Chrome（WebM）で再生できる。codec を記録
- [ ] Mac（Safari）：Video で MP4 を書き出し、再生できる。codec を記録

### D. 性能（Mac の実 GPU）

実験画面の右上「Scientific Mode」をオンにすると、`Renderer backend`・`Renderer FPS (on demand)`・`Objects`・`Geometry layer` が見えます。
FPS は画面が変わるときだけ数えるため、測るときは **再生中** か **ドラッグで動かしながら** 読んでください。

- [ ] `Renderer backend` が `webgl` であること
- [ ] Preset「Pi Walk」、速度 MAX で再生し、Objects が約 10,000 のときの FPS
- [ ] Precision を 100,000 digits にして MAX で再生し、Objects が約 100,000 と 200,000 のときの FPS
- [ ] 「∞ Infinite」をオンにして MAX で再生し、Objects が約 1,000,000 のときの FPS（届くまで数分かかります）
- [ ] 同じ状態で `Geometry layer` を「Graphics (tessellated)」に切り替えたときの FPS（比較用）
- [ ] 1,000,000 objects で、ドラッグ・ズーム・クリックの反応の重さ（メモ）

### E. AI Observer（任意：DeepSeek のキーがある場合）

- [ ] 【ユーザー】実験画面の Inspector の下「AI Observer」で、キーを自分で入力して「Ask AI」を押してもらう
- [ ] 回答が「AI の推測（未検証）」として表示される
- [ ] エラーの場合は、画面のメッセージとコンソール（Mac は開発者ツール、iPhone は Web インスペクタ）のエラーを記録する。CORS エラーなら、その文面をそのまま記録する
- [ ] キーはどこにも記録しない

### F. 再現性（Mac ↔ iPhone）

- [ ] Mac：Preset「Pi Two-Arm (reference candidate)」→ Go to step に `2000` → 「Export JSON」
- [ ] そのファイルを AirDrop などで iPhone に送り、iPhone の実験画面で「Import JSON」→ 「✓ reproduced (SHA-256 match)」になる
- [ ] 逆方向（iPhone で Export → Mac で Import）も同じく ✓ になる

## 手順 5. 結果の記録と報告

```bash
git checkout -b device-check-$(date +%Y%m%d)
mkdir -p docs/device-checks
# docs/device-checks/YYYY-MM-DD.md に結果を書く
```

記録には次のことを含めます。

- 端末：Mac の機種・チップ・macOS、iPhone の機種・iOS、ブラウザのバージョン
- 手順 4 の各項目の結果（✓ / ✗ / 数値 / メモ）
- 問題があれば、再現手順、画面のメッセージ、コンソールのエラー、原因の推定
- スクリーンショットは `docs/device-checks/img/` に置いてもよい（大きな動画ファイルはコミットしない）

最後に、記録をコミットして push し、PR を作ります（タイトル例：「実機確認の記録 YYYY-MM-DD」）。
**問題の修正は、その PR には混ぜず、別の PR で行います。** 修正する前に、何をどう直すかをユーザーに説明して了承を得てください。

報告は日本語で、次の 3 点をユーザーに伝えてください。

1. うまく動いたこと
2. 問題があったこと
3. 次に直すべきことの提案
