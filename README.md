# aibrush-2
A second iteration on the AI brush system, using VQGAN+CLIP to generate images

The goal of the project is to provide a unique user experience for creating artwork by leveraging the power of state-of-the art AI-based image generation.

This system provides an advanced interface to the (https://github.com/nerdyrodent/VQGAN-CLIP)[VQGAN+CLIP] tool.

## Gallery

Some examples of what can be created with VQGAN+CLIP:

![abstract-portal](https://user-images.githubusercontent.com/1783800/140774958-28350d75-a16d-4c3b-8f90-ce1a83a9675c.jpg)

![ancient-ruins](https://user-images.githubusercontent.com/1783800/140775012-cee58e13-6c9b-47c9-892f-53ef35be7c91.jpg)

![positronic-brain](https://user-images.githubusercontent.com/1783800/140775043-5d9afb7f-9f41-4574-8726-73a54c04e8fa.jpg)


## Features:

* Multi-user system with passwordless login
* Create a new image from phrases
* Upload the initial state of an image before processing
* Create one or more child images from a parent
* Manually edit an image and continue processing

## Deployment

* [Deploying on EC2](./DEPLOYING-EC2.md)