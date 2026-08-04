const React = require('react');
const { View } = require('react-native');

const MockIcon = props => React.createElement(View, props);

module.exports = new Proxy(
  {},
  {
    get: () => MockIcon,
  },
);
