import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const finish = async (page: Page) => page.getByRole('slider', { name: '時間', exact: true }).press('End')
async function downloadedJson(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '記録 JSON', exact: true }).click()
  const download = await pending
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}

test.describe('separate word and meaning room', () => {
  test('history, direct links, film, golden room and keyboard keep the π experiment isolated', async ({
    page,
  }) => {
    await page.goto('/#lab')
    await expect(page.getByTestId('digit-stream')).toContainText('3.14159')
    await page.getByRole('button', { name: '言葉と意味の部屋', exact: true }).click()
    await expect(page).toHaveURL(/#dream$/)
    await expect(page.getByRole('dialog', { name: '言葉と意味の部屋' })).toBeVisible()
    await page.getByLabel('言葉', { exact: true }).fill('r')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('current-step')).toHaveText('0')
    await page.getByRole('button', { name: /π の実験へ戻る/ }).click()
    await expect(page).toHaveURL(/#lab$/)
    await page.goto('/#dream')
    await expect(page.getByTestId('film')).toHaveCount(0)
    await page.evaluate(() => {
      window.location.hash = '#film'
    })
    await expect(page.getByTestId('dream-room')).toHaveCount(0)
    await expect(page.getByTestId('film')).toBeVisible()
    await page.evaluate(() => {
      window.location.hash = '#dream'
    })
    await expect(page.getByTestId('dream-room')).toBeVisible()
    await expect(page.getByTestId('film')).toHaveCount(0)
    await expect(page).toHaveURL(/#dream$/)
    await page.evaluate(() => {
      window.location.hash = '#golden'
    })
    await expect(page.getByTestId('golden-room')).toBeVisible()
    await expect(page.getByTestId('dream-room')).toHaveCount(0)
    await page.evaluate(() => {
      window.location.hash = '#dream'
    })
    await expect(page.getByTestId('golden-room')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/#lab$/)
  })

  test('radiating meanings retain unknown conditions, ambiguous words and negative relations', async ({
    page,
  }) => {
    await page.goto('/#dream')
    await finish(page)
    await expect(page.getByTestId('dream-current')).toContainText('じゃがいも → 用途 → 食材')
    const original = await downloadedJson(page)
    expect(original.kind).toBe('concept-model')
    expect(original.graph.selected).toBe('ingredient')
    await page.getByRole('combobox', { name: '関係に必要な条件', exact: true }).selectOption('unknown')
    await finish(page)
    await expect(page.getByTestId('dream-current')).toContainText('条件が分かるまで')
    await page.getByRole('button', { name: 'はし', exact: true }).click()
    await finish(page)
    await expect(page.getByTestId('dream-current')).toContainText('複数の語義')
    await page.getByRole('combobox', { name: '文脈', exact: true }).selectOption('食卓')
    await page.getByRole('combobox', { name: '選ぶ観点', exact: true }).selectOption('is_a')
    await finish(page)
    await expect(page.getByTestId('dream-current')).toContainText('道具')
    await page.getByLabel('言葉', { exact: true }).fill('未知の星のたね')
    await page.getByRole('button', { name: 'ひらく', exact: true }).click()
    await finish(page)
    await expect(page.getByTestId('dream-current')).toContainText('未登録')
    expect((await downloadedJson(page)).graph.nodes).toEqual([])
    const png = page.waitForEvent('download')
    await page.getByRole('button', { name: 'PNG', exact: true }).click()
    expect((await readFile((await (await png).path())!)).subarray(1, 4).toString()).toBe('PNG')
  })

  test('real recorded candidates wait before selection, and only the chosen entity changes', async ({
    page,
  }) => {
    await page.goto('/#dream')
    await page.getByRole('tab', { name: /02 現在/ }).click()
    await finish(page)
    await expect(page.getByTestId('dream-current')).toContainText('未選択')
    const waiting = await downloadedJson(page)
    expect(waiting.kind).toBe('recorded-execution')
    expect(waiting.decision.outcome.applied).toBeNull()
    await page.getByRole('radio', { name: '対象 box8', exact: true }).check()
    await finish(page)
    const chosen = await downloadedJson(page)
    expect(chosen.decision.understanding.selectedCandidateId).toBe('candidate:1')
    const colored = chosen.decision.after
      .filter((e: { parts: { material: { color: string } }[] }) => e.parts[0]?.material.color === '#ff2038')
      .map((e: { id: string }) => e.id)
    expect(colored).toEqual(['box8'])
    await page.getByRole('combobox', { name: '実行例', exact: true }).selectOption('unknown')
    await finish(page)
    const unknown = await downloadedJson(page)
    expect(unknown.decision.outcome.applied).toBeNull()
    expect(unknown.decision.held.map((h: { word: string }) => h.word)).toContain('星のたね')
    await page.getByRole('combobox', { name: '実行例', exact: true }).selectOption('taught')
    await finish(page)
    expect((await downloadedJson(page)).decision.understanding.realization).toBe('ready')
  })

  test('mobile layout and export leave the current animation and π state intact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#dream')
    await finish(page)
    const canvas = page.locator('.dream-canvas')
    await canvas.scrollIntoViewIfNeeded()
    const box = (await canvas.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(390)
    expect(box.height).toBeGreaterThan(500)
    expect(await page.getByTestId('dream-room').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const before = await downloadedJson(page)
    const available = await page.evaluate(
      () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined',
    )
    if (available) {
      const done = page.waitForEvent('download', { timeout: 45_000 }).catch(() => null)
      const unsupported = page
        .getByRole('alert')
        .waitFor({ state: 'visible', timeout: 45_000 })
        .then(() => null)
        .catch(() => null)
      await page.getByRole('button', { name: '動画を保存', exact: true }).click()
      const video = await Promise.race([done, unsupported])
      if (video) {
        const bytes = await readFile((await video.path())!)
        expect(bytes.subarray(4, 8).toString()).toBe('ftyp')
        expect(bytes.length).toBeGreaterThan(5000)
      } else await expect(page.getByRole('alert')).toContainText('保存できませんでした')
      await expect(page.getByRole('button', { name: '動画を保存', exact: true })).toBeEnabled()
      expect((await downloadedJson(page)).progress).toBe(before.progress)
    } else await expect(page.getByRole('button', { name: '動画を保存', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: /π の実験へ戻る/ }).click()
    await expect(page.getByTestId('current-step')).toHaveText('0')
  })
})
