# tika-server

Tika server for deployment on AWS Elastic Beanstalk

## Usage

The [Docker Hub image](https://cloud.docker.com/repository/registry-1.docker.io/joeltg/tika-server) should auto-build on every repo push.

Deploying to AWS is just uploading `Dockerrun.aws.json` to Elastic Beanstalk.

## Configuration

- `/Dockerrun.aws.json`
  - `-enableUnsecureFeatures` and `-enableFileUrl` are documented [here](https://wiki.apache.org/tika/TikaJAXRS#Specifying_a_URL_Instead_of_Putting_Bytes).
  - `-spawnChild` is documented [here](https://wiki.apache.org/tika/TikaJAXRS#Making_Tika_Server_Robust_to_OOMs.2C_Infinite_Loops_and_Memory_Leaks). "This starts tika-server in a child process, and if there's an OOM, a timeout or other catastrophic problem with the child process, the parent process will kill and/or restart the child process."
  - `-JXmx1g` sets the max heap for the spawned child process at 1GB.
  - `-JXms256m` sets the initial heap for the spawned child process at 256MB.
