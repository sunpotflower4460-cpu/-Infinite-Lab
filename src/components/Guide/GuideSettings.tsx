import { useState } from 'react'
import {
  CLASS_LABEL,
  CLASS_NOTE,
  CLASS_ORDER,
  MODELS,
  PROVIDER_ORDER,
  PROVIDERS,
  typicalYen,
  type GuideSettings,
  type ModelClass,
  type ProviderId,
} from '../../guide/providers'
import { guide, useGuide } from '../../guide/store'

/** The three classes and their models, and each company's key (kept in this browser only). */
export function GuideSettingsView() {
  const saved = useGuide((s) => s.settings)
  const [s, setS] = useState<GuideSettings>(() => structuredClone(saved))
  const [openModel, setOpenModel] = useState<string | null>(null)
  const choose = (c: ModelClass, id: string) => setS({ ...s, choice: { ...s.choice, [c]: id } })
  const setModel = (id: string, patch: Partial<GuideSettings['models'][string]>) =>
    setS({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, ...patch } } })
  const setProvider = (id: ProviderId, patch: Partial<GuideSettings['providers'][ProviderId]>) =>
    setS({ ...s, providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } } })

  return (
    <div className="guide-body guide-settings" data-testid="guide-settings">
      <p className="guide-small">
        質問にはまず<b>下</b>の AI が答えます。足りないときは、答えの下のボタンで<b>中</b>や<b>上</b>
        に聞き直せます。 値段は 100 万トークンあたりの定価（入力 / 出力）、「1 回」は囲んだ画像つきの質問 1
        回の目安、点数は Artificial Analysis の総合点（v4.3.2）です。いずれも 2026 年 9 月時点。
      </p>

      {CLASS_ORDER.map((c) => (
        <fieldset key={c} className="guide-class">
          <legend>
            <b className={`guide-class-badge guide-class-${c}`}>{CLASS_LABEL[c]}</b> {CLASS_NOTE[c]}
          </legend>
          {MODELS.filter((m) => m.class === c).map((m) => {
            const hasKey = !!s.providers[m.provider].apiKey.trim()
            return (
              <div key={m.id} className={`guide-model ${s.choice[c] === m.id ? 'chosen' : ''}`}>
                <label className="guide-model-row">
                  <input
                    type="radio"
                    name={`class-${c}`}
                    checked={s.choice[c] === m.id}
                    onChange={() => choose(c, m.id)}
                    aria-label={`${CLASS_LABEL[c]}：${m.label}`}
                  />
                  <span className="guide-model-name">{m.label}</span>
                  <span className="guide-model-facts">
                    ${m.price[0]} / ${m.price[1]}・1 回 {typicalYen(m.id)}・{m.score ?? '—'} 点
                    {hasKey ? '' : '・キーなし'}
                  </span>
                </label>
                {m.note && <div className="guide-small guide-model-note">{m.note}</div>}
                <button className="guide-link" onClick={() => setOpenModel(openModel === m.id ? null : m.id)}>
                  {openModel === m.id ? '閉じる' : 'モデル名・画像'}
                </button>
                {openModel === m.id && (
                  <div className="guide-provider-body">
                    <label className="guide-field">
                      API に送るモデル名（名前が変わったときに直す）
                      <input
                        value={s.models[m.id]!.model}
                        onChange={(e) => setModel(m.id, { model: e.target.value })}
                        aria-label={`${m.label} model`}
                      />
                    </label>
                    <label className="guide-check">
                      <input
                        type="checkbox"
                        checked={s.models[m.id]!.vision}
                        onChange={(e) => setModel(m.id, { vision: e.target.checked })}
                      />
                      囲んだ部分の画像を送る
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </fieldset>
      ))}

      <h4>会社ごとの API キー</h4>
      {PROVIDER_ORDER.map((id) => {
        const info = PROVIDERS[id]
        const p = s.providers[id]
        const used = CLASS_ORDER.some((c) => MODELS.find((m) => m.id === s.choice[c])?.provider === id)
        return (
          <div key={id} className={`guide-provider ${used ? 'used' : ''}`}>
            <div className="guide-provider-body">
              <label className="guide-field">
                {info.label}
                {used ? '（使用中）' : ''}
                <input
                  type="password"
                  value={p.apiKey}
                  onChange={(e) => setProvider(id, { apiKey: e.target.value })}
                  autoComplete="off"
                  placeholder="API キー"
                  aria-label={`${info.label} API key`}
                />
              </label>
              <details>
                <summary className="guide-small">接続先 URL</summary>
                <label className="guide-field">
                  {info.kind === 'anthropic'
                    ? '空欄で公式'
                    : 'ブラウザから直接つながらないときは中継サーバーの URL に'}
                  <input
                    value={p.baseUrl}
                    onChange={(e) => setProvider(id, { baseUrl: e.target.value })}
                    aria-label={`${info.label} base URL`}
                  />
                </label>
              </details>
            </div>
          </div>
        )
      })}
      <p className="guide-small">
        キーはこのブラウザにだけ保存され、その会社の接続先にだけ送られます。書き出しや履歴には入りません。
      </p>
      <div className="guide-attach-actions">
        <button
          className="primary"
          onClick={() => {
            guide.updateSettings(s)
            guide.toggleSettings(false)
            useGuide.setState({ error: null })
          }}
        >
          保存して戻る
        </button>
        <button onClick={() => guide.toggleSettings(false)}>やめる</button>
      </div>
    </div>
  )
}
