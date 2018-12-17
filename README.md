# tika-server
Tika server for deployment on AWS Elastic Beanstalk

## Usage
`make clean && make` should generate an `archive.zip` file that can be uploaded to AWS directly.

## Configuration
- `/Procfile`
  - `-spawnChild` is documented [here](https://wiki.apache.org/tika/TikaJAXRS#Making_Tika_Server_Robust_to_OOMs.2C_Infinite_Loops_and_Memory_Leaks). "This starts tika-server in a child process, and if there's an OOM, a timeout or other catastrophic problem with the child process, the parent process will kill and/or restart the child process."
  - `-JXmx1g` sets the max heap for the spawned child process at 1GB.
  - `-JXms256m` sets the initial heap for the spawned child process at 256MB.
- `/.ebextensions/nginx/conf.d`
  - `client_max_body_size`: by default on Elastic Beanstalk, the nginx proxy that AWS runs for you will cap client request bodies at 10MB (thanks [StackOverflow](https://stackoverflow.com/questions/18908426/increasing-client-max-body-size-in-nginx-conf-on-aws-elastic-beanstalk)). We want to allow file uploads larger than that, so we set it to 1GB.
