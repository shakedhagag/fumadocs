import type { PageTree } from 'next-docs-zeta/server'
import { getPageTreeBuilder, type BuilderOptions } from './build-tree'
import { createPageUtils, type PageUtils } from './page-utils'
import { resolveFiles } from './resolve-files'
import type { Meta, Page } from './types'

type UtilsOptions<Langs extends string[] | undefined> = {
  languages: Langs

  /**
   * @default '/docs'
   */
  baseUrl: string

  /**
   * Where to scan nodes
   * @default 'docs'
   */
  root: string
} & BuilderOptions

type Utils = PageUtils & {
  tree: PageTree
  pages: Page[]
  metas: Meta[]
}

type I18nUtils = Omit<Utils, 'tree'> & {
  tree: Record<string, PageTree>
}

function fromMap<Langs extends string[] | undefined = undefined>(
  map: Record<string, unknown>,
  {
    baseUrl = '/docs',
    root = 'docs',
    getUrl,
    resolveIcon,
    languages
  }: Partial<UtilsOptions<Langs>> = {}
): Langs extends string[] ? I18nUtils : Utils {
  const resolved = resolveFiles({
    map,
    root
  })

  const pageUtils = createPageUtils(resolved, baseUrl, languages ?? [])
  if (getUrl) pageUtils.getPageUrl = getUrl

  const builder = getPageTreeBuilder(resolved, {
    getUrl: pageUtils.getPageUrl,
    resolveIcon
  })

  return {
    ...resolved,
    ...pageUtils,
    tree: (languages == null
      ? builder.build({ root })
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        builder.buildI18n({ languages, root })) as any
  }
}

export { fromMap, resolveFiles, createPageUtils, getPageTreeBuilder }
