module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-svg|phosphor-react-native|@reduxjs|redux|react-redux|immer)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/asyncStorageMock.js',
    '^@react-native-clipboard/clipboard$': '<rootDir>/__mocks__/clipboardMock.js',
    '^phosphor-react-native/lib/commonjs/icons/(.*)$': '<rootDir>/__mocks__/phosphorIconMock.js',
    '^react-native-tts$': '<rootDir>/__mocks__/ttsMock.js',
    '^react-native-razorpay$': '<rootDir>/__mocks__/razorpayMock.js',
    '^@reduxjs/toolkit$': '<rootDir>/node_modules/@reduxjs/toolkit/dist/cjs/index.js',
    '^immer$': '<rootDir>/node_modules/immer/dist/cjs/index.js',
    '^react-redux$': '<rootDir>/node_modules/react-redux/dist/cjs/index.js',
  },
};
