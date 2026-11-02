import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { parseProduct, productHtml } from './products.js';
import { iconSvg } from './icons.js';
import { withBase } from './content.js';

/** Reads src/content/products/<name>.yaml for a product block that says `use: <name>`. */
export function loadShared(name, productsDir) {
  if (!/^[\w-]+$/.test(name)) throw new Error(`product: \`use: ${name}\` must be a file name without folders or extension`);
  const file = ['yaml', 'yml'].map((ext) => join(productsDir, `${name}.${ext}`)).find((f) => existsSync(f));
  if (!file) throw new Error(`product: \`use: ${name}\` but there is no ${join(productsDir, `${name}.yaml`)}`);
  const data = YAML.parse(readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object') throw new Error(`product: ${file} must contain YAML fields like \`name: ...\``);
  return data;
}

/**
 * Turns a ```product code block into a review box with the stores that sell the product.
 * Mistakes in the block fail the build with a message that names the post.
 */
export function remarkProducts({ base = '/', productsDir = 'src/content/products', affiliates = {}, author } = {}) {
  const icons = {
    star: iconSvg('star', { size: 20 }), starHalf: iconSvg('star_half', { size: 20 }),
    pro: iconSvg('thumb_up', { size: 18 }), con: iconSvg('thumb_down', { size: 18 }),
    cart: iconSvg('shopping_cart', { size: 18 }), location: iconSvg('location_on', { size: 18 }), info: iconSvg('info', { size: 16 }),
  };
  return (tree, file) => {
    const where = file?.path ? ` (in ${file.path})` : '';
    const date = file?.data?.astro?.frontmatter?.date;
    const walk = (node) => {
      if (!node.children) return;
      node.children.forEach((child, i) => {
        if (child.type !== 'code' || (child.lang || '').toLowerCase() !== 'product') return walk(child);
        let product;
        try {
          const raw = YAML.parse(child.value);
          const shared = raw && typeof raw === 'object' && raw.use ? loadShared(String(raw.use), productsDir) : null;
          product = parseProduct(child.value, { shared, date, affiliates });
        } catch (e) {
          throw new Error(`${e.message}${where}`);
        }
        const imageSrc = product.image?.startsWith('/') && !product.image.startsWith('//') ? withBase(product.image, base) : product.image;
        node.children[i] = { type: 'html', value: productHtml(product, { icons, disclosure: affiliates.disclosure, author, imageSrc }) };
      });
    };
    walk(tree);
  };
}
