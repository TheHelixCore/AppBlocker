/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/native/AppBlockerModule', () => ({
  __esModule: true,
  default: {
    hasPasswordsSet: jest.fn().mockResolvedValue(false),
  },
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
