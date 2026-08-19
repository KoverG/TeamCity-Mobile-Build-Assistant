import interCyrillic400 from '@fontsource/inter/files/inter-cyrillic-400-normal.woff2?url'
import interCyrillic500 from '@fontsource/inter/files/inter-cyrillic-500-normal.woff2?url'
import interCyrillic600 from '@fontsource/inter/files/inter-cyrillic-600-normal.woff2?url'
import interCyrillic700 from '@fontsource/inter/files/inter-cyrillic-700-normal.woff2?url'
import interLatin400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url'
import interLatin500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url'
import interLatin600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url'
import interLatin700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url'
import { contentAssetUrl } from '../assetUrl'

const cyrillicRange = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'
const latinRange = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

function fontFace(source: string, weight: number, unicodeRange: string): string {
  return `@font-face {
    font-family: "TCBA Inter";
    font-style: normal;
    font-display: swap;
    font-weight: ${weight};
    src: url("${contentAssetUrl(source)}") format("woff2");
    unicode-range: ${unicodeRange};
  }`
}

export const fontStyles = [
  fontFace(interCyrillic400, 400, cyrillicRange),
  fontFace(interLatin400, 400, latinRange),
  fontFace(interCyrillic500, 500, cyrillicRange),
  fontFace(interLatin500, 500, latinRange),
  fontFace(interCyrillic600, 600, cyrillicRange),
  fontFace(interLatin600, 600, latinRange),
  fontFace(interCyrillic700, 700, cyrillicRange),
  fontFace(interLatin700, 700, latinRange),
].join('\n')
