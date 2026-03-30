import type { ThemeConfig } from 'antd'
import { theme as antdTheme } from 'antd'

const palette = {
  primaryLight: '#6f6b52',
  primaryDark: '#8f8a70',
  textLight: '#2f3136',
  textDark: '#e7e8ea',
  bgLight: '#f6f6f2',
  bgDark: '#1e2124',
  surfaceLight: '#ffffff',
  surfaceDark: '#25282c',
  borderLight: '#d4d6ce',
  borderDark: '#3b3f45',
}

export function getAntdTheme(isDark: boolean): ThemeConfig {
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? palette.primaryDark : palette.primaryLight,
      colorInfo: isDark ? palette.primaryDark : palette.primaryLight,
      colorSuccess: isDark ? '#7f8a64' : '#6a7a55',
      colorWarning: isDark ? '#c4a56c' : '#b58a49',
      colorError: isDark ? '#c07b73' : '#b06a62',
      colorTextBase: isDark ? palette.textDark : palette.textLight,
      colorBgBase: isDark ? palette.bgDark : palette.bgLight,
      colorBgContainer: isDark ? palette.surfaceDark : palette.surfaceLight,
      colorBorder: isDark ? palette.borderDark : palette.borderLight,
      borderRadius: 10,
      fontFamily: 'Avenir Next, Avenir, Segoe UI, sans-serif',
    },
    components: {
      Layout: {
        headerBg: isDark ? palette.surfaceDark : palette.surfaceLight,
        siderBg: isDark ? palette.surfaceDark : palette.surfaceLight,
        bodyBg: isDark ? palette.bgDark : palette.bgLight,
      },
      Menu: {
        itemBg: 'transparent',
        itemSelectedBg: 'transparent',
      },
      Card: {
        headerBg: isDark ? palette.surfaceDark : palette.surfaceLight,
      },
    },
  }
}
