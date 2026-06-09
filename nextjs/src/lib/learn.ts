// Learning content for interactive topology elements.
// `short` powers the hover tooltip; `long` + `docUrl` power the side drawer.
// Doc links point at free, authoritative sources (kubernetes.io concept pages)
// for added credibility and extra learning.

export type LearnKey =
  | "traffic"
  | "ingress"
  | "controlPlane"
  | "deployment"
  | "hpa"
  | "node"
  | "pod";

export interface LearnEntry {
  title: string;
  short: string;
  long: string;
  docUrl: string;
  docLabel: string;
}

export const LEARN: Record<LearnKey, LearnEntry> = {
  traffic: {
    title: "Traffic (Requests per second)",
    short: "Incoming user requests per second",
    long: "Traffic is the live rate of requests hitting your application, measured in requests per second (RPS). It is not a Kubernetes object — it's the workload itself. In this simulator, RPS is the primary driver of scaling: more traffic means more desired pods, which means more nodes, which means more cost and carbon. Watching how RPS ripples through the topology is the core cause-and-effect lesson here.",
    docUrl: "https://kubernetes.io/docs/concepts/workloads/autoscaling/",
    docLabel: "Kubernetes: Autoscaling Workloads",
  },
  ingress: {
    title: "Ingress / Load Balancer",
    short: "Routes external traffic into the cluster",
    long: "Ingress is the entry point that exposes your services to the outside world and routes incoming requests to the right pods. On AWS this is typically backed by an Application Load Balancer (ALB), which spreads traffic across healthy pods. Without an ingress (or a Service of type LoadBalancer), external users cannot reach your workload.",
    docUrl: "https://kubernetes.io/docs/concepts/services-networking/ingress/",
    docLabel: "Kubernetes: Ingress",
  },
  controlPlane: {
    title: "Control Plane",
    short: "Keeps the cluster at its desired state",
    long: "The control plane is the brain of the cluster. It continuously compares the desired state you declared in your manifests against the actual state of the cluster, and takes action to close the gap — scheduling pods, scaling replicas, and restarting failures. Components like the API server, scheduler, and controllers all live here. You declare intent; the control plane makes it real.",
    docUrl: "https://kubernetes.io/docs/concepts/overview/components/#control-plane-components",
    docLabel: "Kubernetes: Control Plane Components",
  },
  deployment: {
    title: "Deployment",
    short: "Declares and maintains pod replicas",
    long: "A Deployment is a controller that manages a set of identical pods. You declare how many replicas you want and which container image to run, and the Deployment ensures that many pods stay running — replacing any that crash and rolling out updates gradually. It is the most common way to run stateless applications on Kubernetes.",
    docUrl: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
    docLabel: "Kubernetes: Deployments",
  },
  hpa: {
    title: "HorizontalPodAutoscaler (HPA)",
    short: "Automatically scales pods with load",
    long: "The HorizontalPodAutoscaler automatically adjusts the number of pods in a Deployment based on observed load (such as CPU, memory, or request rate). You set a minimum and maximum replica count and a target metric; the HPA adds pods when demand rises and removes them when it falls. This is what makes a cluster elastic — and what directly couples your traffic to your cost and carbon.",
    docUrl: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
    docLabel: "Kubernetes: Horizontal Pod Autoscaling",
  },
  node: {
    title: "Node",
    short: "A worker machine that runs pods",
    long: "A Node is a worker machine (a virtual or physical server) that actually runs your pods. Each node has a fixed capacity of CPU and memory, so it can only host so many pods before a new node is needed. Nodes are the unit you pay for and the unit that emits carbon — fitting more pods per node is the lever for efficiency.",
    docUrl: "https://kubernetes.io/docs/concepts/architecture/nodes/",
    docLabel: "Kubernetes: Nodes",
  },
  pod: {
    title: "Pod",
    short: "The smallest deployable unit",
    long: "A Pod is the smallest deployable unit in Kubernetes — one or more containers that share storage, network, and a lifecycle. Pods are ephemeral: they are created and destroyed as Deployments scale and the HPA reacts to load. You rarely create pods directly; instead a controller like a Deployment manages them for you.",
    docUrl: "https://kubernetes.io/docs/concepts/workloads/pods/",
    docLabel: "Kubernetes: Pods",
  },
};
