# learnetes-code

The cost and carbon models behind **Learnetes** — a browser-based Kubernetes
simulator that lets students see what a workload would cost and emit *before*
they deploy it.

The repository root holds the algorithmic core: the deterministic models, the
manifest parser, and the test suite. The full Next.js / React frontend that
wraps these models is included under [`nextjs/`](nextjs/), so the entire tool
is reproducible from this one repository. Everything here runs without a
server, a cloud account, or a running cluster.



## Why this exists

The models are deterministic — every output is a pure function of its inputs,
with no randomness anywhere. That is what makes the experiments in the project
report reproducible: re-entering the same scenario yields the same numbers
every time. This repo is published so those results can be checked directly
against the source.

## Modules

| File | Purpose |
| --- | --- |
| `types.ts` | Scenario, cost, carbon, and topology type definitions. |
| `pricing.ts` | AWS region table, per-component prices, USD→INR exchange rate. |
| `carbon.ts` | Per-vCPU power, per-GB-RAM power, PUE, network energy factor. |
| `calculate.ts` | The `simulate()` function combining all model components. |
| `yamlParser.ts` | Parses Kubernetes YAML and the custom `WorkloadProfile` resource. |
| `topology.ts` | Derives effective replicas and node counts from a scenario + HPA. |
| `simulation.ts` | Traffic-pattern generator and the stateful HPA controller. |
| `runPricing.ts` | Prices an actual run from pod-seconds and projects to a month. |

Tests for each model live in `tests/`.

## Data sources

All pricing and carbon figures are recorded snapshots from public sources,
stored as static values so the date of collection is unambiguous:

- AWS public pricing pages (EC2, EKS, Application Load Balancer)
- Cloud Carbon Footprint methodology (per-vCPU / per-GB energy coefficients)
- Electricity Maps regional grid carbon-intensity data
- Green Software Foundation Software Carbon Intensity (SCI) specification

## Running the tests

```bash
npm install
npm test          # 62 unit tests across the six model modules
npm run typecheck # tsc --noEmit
```

## Frontend (`nextjs/`)

The complete browser app — the YAML editor, the live topology view, and the
cost and carbon dashboards — lives under [`nextjs/`](nextjs/). It is a
client-side Next.js / React / TypeScript application with no backend.

```bash
cd nextjs
npm install
npm run dev    # http://localhost:3000
npm run build  # static production build
```

## License

MIT — free for educational and any other use. See [LICENSE](LICENSE).
