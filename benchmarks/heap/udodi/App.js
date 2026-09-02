import { createComponent, html, touch } from "../../../dist/index.js";

const ROW_COUNT = 1000;

function createRows() {
    return Array.from({ length: ROW_COUNT }, (_, index) => ({
        id: index + 1,
        title: `Record ${index + 1}`,
        category: index % 4,
        score: (index * 17) % 101,
        active: index % 3 !== 0,
        tags: [`tag-${index % 8}`, `group-${index % 5}`],
    }));
}

export const App = createComponent({
    name: "HeapBenchmark",
    state() {
        return {
            rows: createRows(),
        };
    },
    methods: {
        updateRow(index) {
            const row = this.rows[index];
            this.rows = this.rows.map((candidate, rowIndex) => rowIndex === index
                ? { ...row, score: (row.score + 1) % 101, active: !row.active }
                : candidate);
        },

        // This version of updateRow below mutates the row object directly and then calls touch to notify the framework 
        // that the rows array has changed. This avoids creating a new array and is more efficient for this benchmark.

        // Because of that the performance.now() can't reasonably measure the time it takes to update the row, so 
        // we don't use it in this benchmark.
        /*updateRow(index) {
            const row = this.rows[index];

            row.score = (row.score + 1) % 101;
            row.active = !row.active;

            touch(this, "rows");
        },*/
    },
    template: () => html`
        <main>
            <ul>
                <li @for="row index rows" @key="row.id">
                    <div>
                        <span @text="index"></span>
                        <span @text="row.title"></span>
                        <span @text="row.category"></span>
                        <span @text="row.score"></span>
                        <span @text="row.active"></span>
                        <span @text="row.tags"></span>
                    </div>
                </li>
            </ul>
        </main>
    `
});
