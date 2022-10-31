import * as axios from "axios"

const serverUrl = "https://vast.ai/api/v0";

export interface SearchOffersResult {
    offers: Array<any>;
}

export class VastAIApi {
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
                gte: 2.0000000000000004,
            },
            inet_down: {
                gte: 8.000000000000002,
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
        console.log(urlEncodedQ);
        const result = await axios.default.get(`${serverUrl}/bundles/?api_key=${this.apiKey}&q=${urlEncodedQ}`)
        return result.data as SearchOffersResult;
    }

//     def create__instance(args: argparse.Namespace):
//     """Performs the same action as pressing the "RENT" button on the website at https://vast.ai/console/create/.
//     :param argparse.Namespace args: Namespace with many fields relevant to the endpoint.
//     """
//     if args.onstart:
//         with open(args.onstart, "r") as reader:
//             args.onstart_cmd = reader.read()
//     runtype = 'ssh'
//     if args.args:
//         runtype = 'args'
//     if args.jupyter_dir or args.jupyter_lab:
//         args.jupyter = True
//     if args.jupyter and runtype == 'args':
//         print("Error: Can't use --jupyter and --args together. Try --onstart or --onstart-cmd instead of --args.", file=sys.stderr)
//         return 1

//     if args.jupyter:
//         runtype = 'jupyter_direc ssh_direct ssh_proxy' if args.direct else 'jupyter_proxy ssh_proxy'

//     if args.ssh:
//         runtype = 'ssh_direct ssh_proxy' if args.direct else 'ssh_proxy'

//     url = apiurl(args, "/asks/{id}/".format(id=args.id))
//     r = requests.put(url, json={
//         "client_id": "me",
//         "image": args.image,
//         "args": args.args,
//         "env" : parse_env(args.env),
//         "price": args.price,
//         "disk": args.disk,
//         "label": args.label,
//         "extra": args.extra,
//         "onstart": args.onstart_cmd,
//         "runtype": runtype,
//         "image_login": args.login,
//         "python_utf8": args.python_utf8,
//         "lang_utf8": args.lang_utf8,
//         "use_jupyter_lab": args.jupyter_lab,
//         "jupyter_dir": args.jupyter_dir,
//         "create_from": args.create_from,
//         "force": args.force
//     })
//     r.raise_for_status()
//     if args.raw:
//         print(json.dumps(r.json(), indent=1))
//     else:
//         print("Started. {}".format(r.json()))
    async createInstance(askId: string, image: string, onStart: string, env: {[key: string]: string}) {

        // default url with query string:
        // https://vast.ai/api/v0/bundles/?q=%7B%22disk_space%22%3A%7B%22gte%22%3A10%7D%2C%22reliability2%22%3A%7B%22gte%22%3A0.9%7D%2C%22duration%22%3A%7B%22gte%22%3A259200.0000000001%7D%2C%22datacenter%22%3A%7B%7D%2C%22verified%22%3A%7B%22eq%22%3Atrue%7D%2C%22rentable%22%3A%7B%22eq%22%3Atrue%7D%2C%22dph_total%22%3A%7B%7D%2C%22flops_per_dollar%22%3A%7B%7D%2C%22num_gpus%22%3A%7B%7D%2C%22total_flops%22%3A%7B%7D%2C%22gpu_ram%22%3A%7B%7D%2C%22gpu_mem_bw%22%3A%7B%7D%2C%22pcie_bw%22%3A%7B%7D%2C%22bw_nvlink%22%3A%7B%7D%2C%22cpu_cores_effective%22%3A%7B%7D%2C%22cpu_ram%22%3A%7B%22gte%22%3A3071.9999999999973%7D%2C%22disk_bw%22%3A%7B%22gte%22%3A40.000000000000014%7D%2C%22inet_up%22%3A%7B%22gte%22%3A2.0000000000000004%7D%2C%22inet_down%22%3A%7B%22gte%22%3A8.000000000000002%7D%2C%22direct_port_count%22%3A%7B%7D%2C%22order%22%3A%5B%5B%22score%22%2C%22desc%22%5D%5D%2C%22allocated_storage%22%3A10%2C%22cuda_max_good%22%3A%7B%22gte%22%3A11%7D%2C%22extra_ids%22%3A%5B%5D%2C%22type%22%3A%22ask%22%7D





        // {"client_id":"me","image":"wolfgangmeyers/aibrush","env":{"WORKER_LOGIN_CODE":"78fdeeb0-8775-45e9-a4f6-9890663de6b9"},"args_str":"","onstart":"/app/aibrush-2/worker/images_worker.sh","runtype":"ssh_proxy","image_login":null,"use_jupyter_lab":false,"disk":10,"min_duration":259200.0000000001}
        const url = `${serverUrl}/asks/${askId}/?api_key=${this.apiKey}`
        console.log("create url", url)
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
        return r.data;
    }
}
