import _ from "lodash";

// Share pending requests, but let failed requests retry.
export const memoizeAsync = <A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
    key: (...args: A) => string,
) => {
    const cached = _.memoize((...args: A) => {
        const id = key(...args);
        const pending = fn(...args).catch((error) => {
            if (cached.cache.get(id) === pending) cached.cache.delete(id);
            throw error;
        });
        return pending;
    }, key);
    return cached;
};
