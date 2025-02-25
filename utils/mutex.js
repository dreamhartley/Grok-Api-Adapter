const mutex = new Map();

const acquireLock = async (key) => {
    while (mutex.get(key)) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    mutex.set(key, true);
};

const releaseLock = (key) => {
    mutex.delete(key);
};

module.exports = { acquireLock, releaseLock };