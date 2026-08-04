const storage = new Map();

const AsyncStorage = {
  getItem: jest.fn(async key => (storage.has(key) ? storage.get(key) : null)),
  setItem: jest.fn(async (key, value) => {
    storage.set(key, value);
  }),
  removeItem: jest.fn(async key => {
    storage.delete(key);
  }),
  clear: jest.fn(async () => {
    storage.clear();
  }),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
