import React from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store/store';
import RootNavigator from './src/navigation/RootNavigator';
import { fonts } from './src/theme/typography';

const applyDefaultFont = (Component: typeof Text | typeof TextInput) => {
  const componentWithDefaults = Component as typeof Component & {
    defaultProps?: { style?: unknown };
  };
  componentWithDefaults.defaultProps = componentWithDefaults.defaultProps || {};
  componentWithDefaults.defaultProps.style = [
    componentWithDefaults.defaultProps.style,
    { fontFamily: fonts.cabinetRegular },
  ];
};

applyDefaultFont(Text);
applyDefaultFont(TextInput);

const App = () => {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </Provider>
  );
};

export default App;
