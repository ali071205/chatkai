export const fonts = {
  cabinetRegular: 'CabinetGrotesk-Regular',
  cabinetMedium: 'CabinetGrotesk-Medium',
  cabinetBold: 'CabinetGrotesk-Bold',
  cabinetBlack: 'CabinetGrotesk-Extrabold',
  teko: 'Teko',
  mono: 'monospace',
};

export const font = {
  regular: {
    fontFamily: fonts.cabinetRegular,
  },
  medium: {
    fontFamily: fonts.cabinetMedium,
  },
  bold: {
    fontFamily: fonts.cabinetBold,
  },
  black: {
    fontFamily: fonts.cabinetBlack,
  },
};

export const containsIndicScript = (value: string) => /[\u0900-\u097F]/.test(value);
