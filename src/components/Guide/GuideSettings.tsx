import { useState } from 'react'
import {
  PROVIDER_ORDER,
  PROVIDERS,
  type GuideSettings,
  type ProviderId,
  type Tier,
} from '../../guide/providers'
import { guide, useGuide } from '../../guide/store'

/** Which AI answers, and each provider's key / model / endpoint (kept in this browser only). */
export function GuideSettingsView() {
  const saved = useGuide((s) => s.settings)
  const [s, setS] = useState<GuideSettings>(() => structuredClone(saved))
  const [open, setOpen] = useState<ProviderId | null>(null)
  const setTier = (t: Tier, id: ProviderId) => setS({ ...s, tiers: { ...s.tiers, [t]: id } })
  const setP = (id: ProviderId, patch: Partial<GuideSettings['providers'][ProviderId]>) =>
    setS({ ...s, providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } } })

  return (
    <div className="guide-body guide-settings" data-testid="guide-settings">
      <p className="guide-small">
        ふだんの質問は「ふつう」の AI
        が答えます。答えの下の「じっくり聞き直す」を押したときだけ、「じっくり」の
        AI（費用の高いモデルなど）に聞きます。
      </p>
      {(['normal', 'deep'] as const).map((t) => (
        <label key={t} className="guide-field">
          {t === 'normal' ? 'ふつう（いつもの質問）' : 'じっくり（聞き直すときだけ）'}
          <select
            value={s.tiers[t]}
            onChange={(e) => setTier(t, e.target.value as ProviderId)}
            aria-label={`${t} provider`}
          >
            {PROVIDER_ORDER.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <h4>AI ごとの設定</h4>
      {PROVIDER_ORDER.map((id) => {
        const p = s.providers[id]
        const info = PROVIDERS[id]
        const used = s.tiers.normal === id || s.tiers.deep === id
        return (
          <div key={id} className={`guide-provider ${used ? 'used' : ''}`}>
            <button
              className="guide-provider-head"
              onClick={() => setOpen(open === id ? null : id)}
              aria-expanded={open === id}
            >
              <span>{info.label}</span>
              <span className="guide-small">
                {p.apiKey ? 'キーあり' : 'キーなし'}
                {p.model ? `・${p.model}` : ''}
                {used ? '・使用中' : ''}
              </span>
            </button>
            {open === id && (
              <div className="guide-provider-body">
                <label className="guide-field">
                  API キー
                  <input
                    type="password"
                    value={p.apiKey}
                    onChange={(e) => setP(id, { apiKey: e.target.value })}
                    autoComplete="off"
                    aria-label={`${info.label} API key`}
                  />
                </label>
                <label className="guide-field">
                  モデル名
                  <input
                    value={p.model}
                    onChange={(e) => setP(id, { model: e.target.value })}
                    aria-label={`${info.label} model`}
                  />
                  <span className="guide-small">{info.modelHint}</span>
                </label>
                <label className="guide-field">
                  接続先 URL{info.kind === 'anthropic' ? '（空欄で公式）' : ''}
                  <input
                    value={p.baseUrl}
                    onChange={(e) => setP(id, { baseUrl: e.target.value })}
                    aria-label={`${info.label} base URL`}
                  />
                  <span className="guide-small">
                    ブラウザから直接つながらないときは、中継サーバーの URL に変えられます。
                  </span>
                </label>
                <label className="guide-check">
                  <input
                    type="checkbox"
                    checked={p.vision}
                    onChange={(e) => setP(id, { vision: e.target.checked })}
                  />
                  囲んだ部分の画像を送る（画像を読めるモデルのとき）
                </label>
              </div>
            )}
          </div>
        )
      })}
      <p className="guide-small">
        キーはこのブラウザにだけ保存され、その AI の接続先にだけ送られます。書き出しや履歴には入りません。
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
