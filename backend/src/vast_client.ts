import * as axios from "axios"

const serverUrl = "https://vast.ai/api/v0";

export interface Offer {
    is_bid: boolean;
    inet_up_billed: number | null;
    inet_down_billed: number | null;
    external: boolean;
    webpage: string | null;
    logo: string;
    rentable: boolean;
    compute_cap: number;
    driver_version: string;
    cuda_max_good: number;
    machine_id: number;
    hosting_type: string | null;
    public_ipaddr: string;
    geolocation: string;
    flops_per_dphtotal: number;
    dlperf_per_dphtotal: number;
    reliability2: number;
    host_id: number;
    id: number;
    bundle_id: number;
    num_gpus: number;
    total_flops: number;
    min_bid: number;
    dph_base: number;
    dph_total: number;
    gpu_name: string;
    gpu_ram: number;
    gpu_display_active: boolean;
    gpu_mem_bw: number;
    bw_nvlink: number;
    direct_port_count: number;
    gpu_lanes: number;
    pcie_bw: number;
    pci_gen: number;
    dlperf: number;
    cpu_name: string;
    mobo_name: string;
    cpu_ram: number;
    cpu_cores: number;
    cpu_cores_effective: number;
    gpu_frac: number;
    has_avx: number;
    disk_space: number;
    disk_name: string;
    disk_bw: number;
    inet_up: number;
    inet_down: number;
    start_date: number;
    end_date: number;
    duration: number;
    storage_cost: number;
    inet_up_cost: number;
    inet_down_cost: number;
    storage_total_cost: number;
    verification: string;
    score: number;
    rented: boolean;
    bundled_results: number;
    pending_count: number;
}

export interface Instance {
    is_bid: boolean;
    inet_up_billed: number | null;
    inet_down_billed: number | null;
    external: boolean;
    webpage: string | null;
    logo: string;
    rentable: boolean;
    compute_cap: number;
    driver_version: string;
    cuda_max_good: number;
    machine_id: number;
    hosting_type: string | null;
    public_ipaddr: string;
    geolocation: string;
    flops_per_dphtotal: number;
    dlperf_per_dphtotal: number;
    reliability2: number;
    host_id: number;
    id: number;
    bundle_id: number;
    num_gpus: number;
    total_flops: number;
    min_bid: number;
    dph_base: number;
    dph_total: number;
    gpu_name: string;
    gpu_ram: number;
    gpu_display_active: boolean;
    gpu_mem_bw: number;
    bw_nvlink: number;
    direct_port_count: number;
    gpu_lanes: number;
    pcie_bw: number;
    pci_gen: number;
    dlperf: number;
    cpu_name: string;
    mobo_name: string;
    cpu_ram: number;
    cpu_cores: number;
    cpu_cores_effective: number;
    gpu_frac: number;
    has_avx: number;
    disk_space: number;
    disk_name: string;
    disk_bw: number;
    inet_up: number;
    inet_down: number;
    start_date: number;
    end_date: number;
    duration: number;
    storage_cost: number;
    inet_up_cost: number;
    inet_down_cost: number;
    storage_total_cost: number;
    verification: string;
    score: number;
    ssh_idx: string;
    ssh_host: string;
    ssh_port: number;
    actual_status: string;
    intended_status: string;
    cur_state: string;
    next_state: string;
    image_uuid: string;
    image_args: string[];
    image_runtype: string;
    label: string | null;
    jupyter_token: string;
    status_msg: string;
    gpu_util: number | null;
    disk_util: number;
    gpu_temp: number | null;
    local_ipaddrs: string;
    direct_port_end: number;
    direct_port_start: number;
    cpu_util: number;
    mem_usage: number | null;
    mem_limit: number | null;
    vmem_usage: number | null;
    machine_dir_ssh_port: number;
}

export interface CreateInstanceResult {
    success: boolean;
    new_contract: number;
}

export interface SearchOffersResult {
    offers: Array<Offer>;
}

export interface ListInstancesResult {
    instances: Array<Instance>;
}

export class VastAIApi implements VastClient {
    constructor(private apiKey: string) {

    }

    async searchOffers(): Promise<SearchOffersResult> {


        const q = {
            disk_space: {
                gte: 10,
            },
            reliability2: {
                gte: 0.9,
            },
            duration: {
                gte: 259200.0000000001,
            },
            datacenter: {
            },
            verified: {
                eq: true,
            },
            rentable: {
                eq: true,
            },
            // num_gpus: {
            //     "eq": 1,
            // },
            cpu_ram: {
                gte: 3071.9999999999973,
            },
            disk_bw: {
                gte: 40.000000000000014,
            },
            inet_up: {
                gte: 50.0000000000000004,
            },
            inet_down: {
                gte: 200.000000000000002,
            },
            order: [
                [
                    "score",
                    "desc",
                ],
            ],
            allocated_storage: 10,
            cuda_max_good: {
                gte: 11,
            },
            type: "ask",
            gpu_name: {
                eq: "RTX 3090"
            },
        }

        const qjson = JSON.stringify(q);
        const urlEncodedQ = encodeURIComponent(qjson);
        const result = await axios.default.get(`${serverUrl}/bundles/?api_key=${this.apiKey}&q=${urlEncodedQ}`)
        const offers = (result.data as SearchOffersResult).offers.filter(offer => {
            const cpus = offer.cpu_cores
            const cpus_effective = offer.cpu_cores_effective
            const ratio = cpus_effective / cpus
            const ram_effective = offer.cpu_ram * ratio
            return ram_effective >= 30000
        })
        return {
            offers
        }
    }

    async createInstance(askId: string, image: string, onStart: string, env: {[key: string]: string}): Promise<CreateInstanceResult> {
        const url = `${serverUrl}/asks/${askId}/?api_key=${this.apiKey}`
        const r = await axios.default.put(url, {
            client_id: "me",
            image: image,
            env: env,
            onstart: onStart,
            args_str: "",
            runtype: "ssh_proxy",
            use_jupyter_lab: false,
        }, {
            headers: {
                "Content-Type": "application/json",
            }
        });
        return r.data as any;
    }

    // list instances
    async listInstances(): Promise<ListInstancesResult> {
        const url = `${serverUrl}/instances/?api_key=${this.apiKey}`
        const r = await axios.default.get(url);
        return r.data;
    }

    async listInstancesById(): Promise<{[key: string]: Instance}> {
        const instances = await this.listInstances();
        const result: {[key: string]: Instance} = {};
        for (const instance of instances.instances) {
            result[instance.id] = instance;
        }
        return result;
    }

    // delete instance
    async deleteInstance(instanceId: string) {
        const url = `${serverUrl}/instances/${instanceId}/?api_key=${this.apiKey}`
        const r = await axios.default.delete(url);
        return r.data;
    }

}

export class MockVastAPI {
    // laziness that allows lax test data
    _offers: any = [];
    _instances: any = [];

    // getter that type casts
    get offers(): Array<Offer> {
        return this._offers;
    }

    get instances(): Array<Instance> {
        return this._instances;
    }

    async searchOffers(): Promise<SearchOffersResult> {
        return {
            offers: this.offers,
        }
    }

    async createInstance(askId: string, image: string, onStart: string, env: {[key: string]: string}): Promise<CreateInstanceResult> {
        const id = parseInt(askId);
        const offer = this.offers.find((offer: any) => offer.id === id);
        const instance: Instance = {
            id,
            actual_status: "active",
            intended_status: "active",
            cur_state: "active",
            next_state: "active",
            image: image,
            onStart: onStart,
            env: env,
            num_gpus: offer.num_gpus,
        } as any;
        this.instances.push(instance);
        // remove offer
        this._offers = this.offers.filter(o => o.id !== id);
        return {
            success: true,
            new_contract: id,
        };
    }

    async listInstances(): Promise<ListInstancesResult> {
        return {
            instances: this.instances,
        }
    }

    async listInstancesById(): Promise<{[key: string]: Instance}> {
        const instances = await this.listInstances();
        const result: {[key: string]: Instance} = {};
        for (const instance of instances.instances) {
            result[instance.id] = instance;
        }
        return result;
    }

    async deleteInstance(instanceId: string) {
        const id = parseInt(instanceId);
        this._instances = this.instances.filter(i => i.id !== id);
    }
}

export interface VastClient {
    searchOffers(): Promise<SearchOffersResult>;
    createInstance(askId: string, image: string, onStart: string, env: {[key: string]: string}): Promise<CreateInstanceResult>;
    listInstances(): Promise<ListInstancesResult>;
    listInstancesById(): Promise<{[key: string]: Instance}>;
    deleteInstance(instanceId: string): Promise<void>;
}