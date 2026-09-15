export const benchmarkConfig = {
    baseUrl: "http://127.0.0.1:5173",
    frameworks: {
        udodi: {
            displayName: "Udodi",
            version: "1.1.0",
            benchmarks: [
                { name: "mount", path: "mount", runs: 1 },
                { name: "update-single", path: "update-single", runs: 1 },
                { name: "update-batched", path: "update-batched", runs: 1 },
                { name: "dsl-parse", path: "dsl-parse", runs: 1 },
                { name: "dsl-compile-cold", path: "dsl-compile-cold", runs: 1 },
                { name: "dsl-compile-cached", path: "dsl-compile-cached", runs: 1 },
                { name: "dsl-evaluate", path: "dsl-evaluate", runs: 1 },
                { name: "dsl-directive", path: "dsl-directive", runs: 1 },
                { name: "heap", path: "heap", runs: 1 },
                { name: "css-scope-cold", path: "css-scope-cold", runs: 30 },
                { name: "css-scope-warm", path: "css-scope-warm", runs: 1 },
            ],
        },
    },
};
