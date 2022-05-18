import clip
import argparse
import PIL
import torch

# torch.cuda.empty_cache()

def rank(args):
    device = torch.device('cuda:0' if (torch.cuda.is_available() and not args.cpu) else 'cpu')
    clip_model, clip_preprocess = clip.load('ViT-L/14', device=device, jit=False)
    clip_model.eval().requires_grad_(False)

    text = clip.tokenize([args.text], truncate=True).to(device)
    # clip context
    text_emb_clip = clip_model.encode_text(text)
    text_emb_norm = text_emb_clip[0] / text_emb_clip[0].norm(dim=-1, keepdim=True)

    # load image from file
    img = PIL.Image.open(args.image)
    image_emb = clip_model.encode_image(clip_preprocess(img).unsqueeze(0).to(device))
    image_emb_norm = image_emb / image_emb.norm(dim=-1, keepdim=True)
    similarity = torch.nn.functional.cosine_similarity(image_emb_norm, text_emb_norm, dim=-1)
    return similarity.item()

def main():
    parser = argparse.ArgumentParser(description='CILP Rank')
    # image file
    parser.add_argument('-i', '--image', type=str, required=True, help='image file')
    # text input
    parser.add_argument('-t', '--text', type=str, required=True, help='text input')
    # cpu option
    parser.add_argument('-c', '--cpu', action='store_true', help='use cpu', default=False)

    args = parser.parse_args()
    print(rank(args))

if __name__ == '__main__':
    main()
