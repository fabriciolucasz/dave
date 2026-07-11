// packages/discord-kit/src/containers/blocks.ts

export type ContainerBlockType = 'text' | 'separator' | 'gallery' | 'section' | 'file';

export interface TextBlock {
  blockType: 'text';
  content: string;
}

export interface SeparatorBlock {
  blockType: 'separator';
  spacing?: 'small' | 'large';
  divider?: boolean;
}

export interface GalleryItem {
  url: string;
  alt?: string;
}

export interface GalleryBlock {
  blockType: 'gallery';
  items: GalleryItem[];
}

export interface SectionBlock {
  blockType: 'section';
  text: string;
  accessory?: {
    type: 'thumbnail' | 'button';
    url?: string;
    label?: string;
  };
}

export interface FileBlock {
  blockType: 'file';
  url: string;
}

export type ContainerBlock =
  | TextBlock
  | SeparatorBlock
  | GalleryBlock
  | SectionBlock
  | FileBlock;
