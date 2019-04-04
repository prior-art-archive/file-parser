# tika-server

Tika server for deployment on AWS Elastic Beanstalk

## Overview

The file parser is deployed as an Elastic Beanstalk application on AWS (called FileParser). This platform was chosen because it lets deploy with docker images and lets us auto-scale behind a load-balancer.

This means the code in this repository gets built as a docker image and pushed to Docker Hub at https://hub.docker.com/r/priorartarchive/file-parser. Deploying to AWS is just uploading a `Dockerrun.aws.json` configuration file ([documented here](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_docker_v2config.html)) that tells Elastic Beanstalk to pull `priorartarchive/file-parser` (along with a sibling container from `logicalspark/docker-tikaserver`).

To get a `Dockerrun.aws.json` to upload to Elastic Beanstalk, copy & modify the `Dockerrun.aws.sample.json` to fill out the environment variables:

- `HOSTNAME` is either `priorartarchive.org` or `dev.priorartarchive.org`.
- `IPFS_HOST` is a the DNS address of an _https_ IPFS API route (e.g. if you can `curl https://your.host/api/v0/id`, then `IPFS_HOST=your.host`). For now, we use `api.underlay.store` for both dev and prod.
- `DATABASE_URL` is the fully-qualified postgres URI (including the `username:password@` at the beginning).
- `AWS_REGION` is `us-east-1`.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` need to have `AmazonS3FullAccess`, `AWSLambdaExecute`, and `AWSLambdaRole` permission policies.
- `CONFIGURATION_ID` is the _name of the S3 notification handler_ that is generating the events. The name of the handlers on both the `assets.priorartarchive.org` and `assets.dev.priorartarchive.org` buckets is `NewFile`.

**In addition**, edit the `"image": "priorartarchive/priorart-file-parser"` line to **include the tag** of the docker image that you want to use: for now there's only a `dev` tag but there will be a `prod` tag once v2 goes live.

## Deploying procedure

### Dev

Local changes should be committed to the `dev` branch. When you're ready to deploy a dev version, build a local image and push to the docker hub repo:

```
docker build -t priorartarchive/file-parser:dev .
docker push priorartarchive/file-parser:dev
```

Then head over to Elastic Beanstalk and upload a `Dockerrun.aws.json` file (containing URIs for the development database and elasticsearch, and referencing the `priorartarchive/priorart-file-parser:dev` image) to the `file-parser-dev` environment of the `FileParser` application.

### Prod

Changes to `master` should only come a pull requests from `dev`. When you're ready to deploy a prod version, build a local image and push to the docker hub repo:

```
docker build -t priorartarchive/file-parser:prod .
docker push priorartarchive/file-parser:prod
```

Then head over to Elastic Beanstalk and upload a `Dockerrun.aws.json` file (containing URIs for the production database and elasticsearch, and referencing the `priorartarchive/priorart-file-parser:prod` image) to the `file-parser-prod` environment of the `FileParser` application.

## Configuration

- `/Dockerrun.aws.sample.json`
  - `-spawnChild` is documented [here](https://wiki.apache.org/tika/TikaJAXRS#Making_Tika_Server_Robust_to_OOMs.2C_Infinite_Loops_and_Memory_Leaks). "This starts tika-server in a child process, and if there's an OOM, a timeout or other catastrophic problem with the child process, the parent process will kill and/or restart the child process."
  - `-JXmx1g` sets the max heap for the spawned child process at 1GB.
  - `-JXms256m` sets the initial heap for the spawned child process at 256MB.

## Assertions

In `static/` there are two JSON-LD documents `tika-reference.json` (aka `dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7`) and `tika-provenance.json`. These contain "background" knowledge about Tika that are referenced in the provenance of the assertions we generate.

Specifically, we attribute the resulting transcript and metadata documents to `dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7#_:c14n29` - the [`prov:SoftwareAgent`](https://www.w3.org/TR/prov-o/#SoftwareAgent) that is the Tika software application - with the [`prov:qualifiedAssociation`](https://www.w3.org/TR/prov-o/#qualifiedAssociation) that the software agent had a [`prov:Role`](https://www.w3.org/TR/prov-o/#Role) of `dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7#_:c14n61` (for metadata) or `dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7#_:c14n21` (for text extraction). These "roles" correspond to REST API endpoints that are structured as [schema.org EntryPoints](https://schema.org/EntryPoint) and derived from the [HTML API docs](https://gateway.underlay.store/ipfs/QmQofqmV8FHDpaEVVEwtnBv78pVirdswmcSD2oVZzeSokL) that the Tika server serves from `GET "/"` by default. These are frighteningly & admittedly unwieldy: in the future you'll be able to paste these URIs into the Underlay Playground to get explorable visualizations (both from the source document and from subsequent published references). These sorts of references are a low-level representation that should rarely be seen; it's our job to build better tools for referencing them.

`dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7` (aka `tika-reference.json`) is pinned to [the cluster](https://gateway.underlay.store/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7) and should be considered **stable, to be changed only when absolutely necessary**. `tika-provenance.json` contains provenance _about_ `tika-reference.json` (via explicit reference to `dweb:/ipfs/QmYyRieED9hv4cVH3aQcxTC6xegDZ9kXK2zLxqHAjtBvc7` as a digital document), citing the HTML API reference (that Tika itself generates!) as its source. _In the (near) future we should [sign](https://web-payments.org/vocabs/security#LinkedDataSignature2015) (with some public KFG key) this document and publish it as well,_ but it's not necessary to get the Prior Art Archive working (unlike `tika-reference.json`, whose hash we need to use in our assertions).

`tika-context.json` is copied from and documented at [this Gist](https://gist.github.com/joeltg/f066945ee780bfee769a26cea753f255).
