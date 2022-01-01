# Deploying to EC2

This guide assumes you are familiar enough with AWS to launch a new EC2 instance
from the AWS console. If you are unfamiliar you can read more about it [here](https://aws.amazon.com/premiumsupport/knowledge-center/launch-instance-custom-ami/). The instructions below will provide you with a way to install the entire system on the same machine.

## Launch EC2 instance

1. Navigate to EC2 instances in the AWS console and begin launching a new EC2 instance.
2. Choose AMI: Navigate to the AWS Marketplace tab and select the "AWS Deep Learning AMI (Ubuntu 18.04)" AMI.
3. Choose Instance Type: For the instance type, select `g4dn.xlarge`
4. Configure Instance: Make sure the machine has a public IP address, as it will need to send emails for authentication.
5. Add Storage: Make sure to bump the storage for the primary hard drive to at least 256GB. Otherwise you will run out of space.
6. Add Tags: Optionally add a name for your machine here
7. Configure a Security Group: Create a new security group with name and description "aibrush". Open up port 22 and port 3000 to `0.0.0.0` for open access, or you can restrict the IP addresses if you want. You will probably want to at least restrict SSH access over port 22 to your own IP address.
8. Launch. Select an existing key pair (if you've done this before) or create a new key pair. If you create a new key pair, make sure to download the private key and back it up somewhere safe. You will need it to connect to the instance.
9. You can optionally allocate an elastic IP address and assign it to the instance. This will keep the public IP address the same between reboots.

Once the EC2 box is ready you can start setting it up further. You can monitor the status of the EC2 box from the AWS console. Once you can successfully connect to the EC2 instance using an ssh client (and the private key from step 8), you are ready to proceed.

## Dependencies

1. Follow the instructions [here](https://joshtronic.com/2021/05/09/how-to-install-nodejs-16-on-ubuntu-2004-lts/) to install NodeJS 16.
2. Install Yarn: `sudo npm install -g yarn`
3. Clone the AIBrush codebase: `git clone https://github.com/wolfgangmeyers/aibrush-2.git`
4. Navigate to the `frontend` folder and run `yarn` to install dependencies.
5. Run `yarn genclient` to generate client code from the OpenAPI spec.
6. Navigate to the `backend` folder and run `yarn` to install dependencies.
7. Run `yarn genclient` to generate client code from the OpenAPI spec.
8. The deep learning AMI should already have Anaconda installed. Check for the `/home/ubuntu/anaconda3` folder. If it isn't present, install Anaconda:

```shell
curl -O https://repo.anaconda.com/archive/Anaconda3-2021.11-Linux-x86_64.sh
sha256sum Anaconda3-2021.11-Linux-x86_64.sh
# should match the hash for the same filename on https://docs.anaconda.com/anaconda/install/hashes/all/
bash Anaconda3-2021.11-Linux-x86_64.sh
# Agree to everything and accept defaults
```

(Optional) If anaconda is already installed, use the following command to update it:

```shell
conda update -n base -c defaults conda
```

7. Navigate to the `worker` folder and follow the steps outlined in the [worker readme](./worker/README.md) to fully set up the environment for the worker.

## Building the frontend

1. Navigate to the `backend` folder
2. Run `export REACT_APP_ENV=alt`
3. Run `yarn build_frontend`

## Configuring the backend

1. Navigate to the `backend` folder
2. Run `cp aibrush-config.json.example aibrush-config.json`
3. Edit the secret (this can be any random string, just make sure to keep it secret), smtpUser and smtpPassword. This example uses Gmail as an smtp server, but you can set it up with a different smtp host. Note that if you have two factor authentication set up on the Gmail account, you will need to use [an application specific password](https://support.google.com/accounts/answer/185833?hl=en)
4. Edit the `serviceAccounts` field to be a list of email addresses that should be used as service accounts. These must be different than the emails used to access the system from the UI, because they are granted different permissions. If you are using a gmail email address, you can just use `<email address>+sa@gmail.com` alias.

## Database

1. Install postgres: `sudo apt install -y postgresql`
2. Edit the client configuration to allow login without password: Find the following lines in ` /etc/postgresql/10/main/pg_hba.conf` and change "md5" to "trust":

Note: You will need to edit the file as root.

```
# "local" is for Unix domain socket connections only
local   all             all                                     trust
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
```

3. Start the database server: `sudo service postgresql start`

## Running

In order to keep the backend and worker processes running on the EC2 instance, you
can use [GNU Screen](https://www.gnu.org/software/screen/). This should already be installed on the EC2 instance.

1. Run `screen -S backend` to receive a new prompt.
2. Navigate to the `backend` folder and run `yarn start`
3. Exit out of the screen by holding CTRL and pressing A then D keys.
4. Run `screen -S worker` to receive a new prompt.
5. Navigate to the `worker` folder.
6. Run `conda activate vqgan`
7. If you haven't already authenticated the worker, make sure to do so now:

```shell
python login.py http://localhost:3000
```

This will prompt you for an email address (enter an email configured as a service account in the backend configuration).
After entering the email, it should prompt for a code. Check the email inbox for the service account for the code, and enter it.
If all succeeds, this will write out a `credentials.json` file that will allow the service worker to communicate with the backend. The credentials are set to last for 1 year with the default backend settings.

8. Run `python worker.py http://localhost:3000`
9. Exit out of the screen by holding CTRL and pressing A then D keys.

You should be able to re-connect to the backend and worker screens by running `screen -r backend` or `screen -r worker` respectively. This will allow you to view logs and to terminate the process if needed.

If everything has succeeded, you should be able to navigate to http://<ip address of EC2 box>:3000 and see the AI brush login.

