import { Product, PromoCode, Review } from '@/types';

export const PROMO_CODES: PromoCode[] = [
  { code: 'PANTO10', discountPercent: 10, description: '10% off entire order' },
  { code: 'SHOP20', discountPercent: 20, description: '20% off for new customers' },
  { code: 'VIP30', discountPercent: 30, description: '30% VIP summer discount' },
];

export const MOCK_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    author: 'Samantha D.',
    rating: 5,
    verified: true,
    comment:
      'I absolutely love this t-shirt! The design is unique and the fabric feels so comfortable. As a fellow designer, I appreciate the attention to detail. It\'s become my favorite go-to shirt.',
    date: 'August 14, 2023',
  },
  {
    id: 'rev-2',
    author: 'Alex M.',
    rating: 4,
    verified: true,
    comment:
      'The item exceeded my expectations! The colors are vibrant and the build quality is top-notch. Being a UI/UX designer myself, I\'m quite picky about aesthetics, and this definitely gets a thumbs up from me.',
    date: 'August 15, 2023',
  },
  {
    id: 'rev-3',
    author: 'Ethan R.',
    rating: 4.5,
    verified: true,
    comment:
      'A must-have for anyone who appreciates modern design and premium materials. The fit and finish are exceptional. I can see the designer\'s touch in every aspect.',
    date: 'August 16, 2023',
  },
  {
    id: 'rev-4',
    author: 'Olivia P.',
    rating: 5,
    verified: true,
    comment:
      'As soon as I opened the package, I could feel the difference in quality. Lightweight, breathable, and fits true to size. I\'ve received multiple compliments already!',
    date: 'August 17, 2023',
  },
  {
    id: 'rev-5',
    author: 'Liam K.',
    rating: 4,
    verified: true,
    comment:
      'Solid piece with premium stitching. Washed it three times already and zero shrinkage or fading. Will definitely be buying in more colorways.',
    date: 'August 18, 2023',
  },
  {
    id: 'rev-6',
    author: 'Ava H.',
    rating: 5,
    verified: true,
    comment:
      'I\'m blown away by the quality and style of the clothes and tech gear from Shop.co. From casual wear to elegant pieces, every single item has exceeded my expectations.',
    date: 'August 19, 2023',
  },
];

export const PRODUCTS: Product[] = [
  // 1. APPAREL - HERO Figma PDP
  {
    id: 'one-life-graphic-tshirt',
    name: 'One Life Graphic T-shirt',
    slug: 'one-life-graphic-tshirt',
    description:
      'This graphic t-shirt is perfect for any occasion. Crafted from a soft and breathable fabric, it offers superior comfort and style. Featuring custom typography and an earthy palette, this wardrobe essential brings effortless streetwear vibes.',
    price: 260,
    originalPrice: 300,
    discountPercent: 40,
    rating: 4.5,
    reviewCount: 451,
    category: 't-shirts',
    dressStyle: 'casual',
    gender: 'men',
    images: [
      '/images/categories/tshirts.webp',
      '/images/categories/tshirt_white.webp',
    ],
    colors: [
      { name: 'Olive Green', hex: '#4F583D' },
      { name: 'Forest Slate', hex: '#314F4A' },
      { name: 'Midnight Navy', hex: '#31344F' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large'],
    isTopSelling: true,
    details: [
      '100% Premium Heavyweight Combed Cotton (240 GSM)',
      'High-definition silk-screen typographic graphic chest print',
      'Ribbed knit collar with reinforced double-stitched hem',
      'Pre-shrunk fabric to prevent post-wash deformation',
      'Machine wash cold, tumble dry low heat',
    ],
    faqs: [
      {
        question: 'What is the fit of this t-shirt?',
        answer: 'It features a relaxed streetwear boxy fit. If you prefer a tighter, regular fit, we recommend sizing down.',
      },
      {
        question: 'Does the graphic print crack after washing?',
        answer: 'No, our screen-print utilizes durable plastisol ink cured at high temperature for long-lasting vibrant color.',
      },
      {
        question: 'How fast is delivery?',
        answer: 'Orders are dispatched within 24 hours. Standard domestic delivery takes 2-4 business days.',
      },
    ],
    reviews: MOCK_REVIEWS,
  },

  // 2. APPAREL - T-shirt with Tape Details
  {
    id: 'tshirt-tape-details',
    name: 'T-shirt with Tape Details',
    slug: 'tshirt-tape-details',
    description:
      'Minimalist black t-shirt accented with branded sleeve tape details. Crafted from organic ring-spun cotton for an ultra-smooth finish.',
    price: 120,
    rating: 4.5,
    reviewCount: 120,
    category: 't-shirts',
    dressStyle: 'casual',
    gender: 'men',
    images: [
      '/images/categories/tshirts.webp',
      '/images/categories/tshirt_white.webp',
    ],
    colors: [
      { name: 'Matte Black', hex: '#111827' },
      { name: 'Clean White', hex: '#FFFFFF' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'],
    isNewArrival: true,
    details: ['100% Organic Cotton', 'Woven jacquard sleeve tape', 'Regular fit'],
    faqs: [
      { question: 'Is it breathable?', answer: 'Yes, lightweight 180 GSM cotton makes it ideal for warm weather.' }
    ],
    reviews: MOCK_REVIEWS.slice(0, 3),
  },

  // 3. APPAREL - Skinny Fit Jeans
  {
    id: 'skinny-fit-jeans',
    name: 'Skinny Fit Jeans',
    slug: 'skinny-fit-jeans',
    description:
      'Premium stretch denim with subtle whiskering and tailored skinny leg profile. Form-fitting comfort with maximum flexibility.',
    price: 240,
    originalPrice: 260,
    discountPercent: 20,
    rating: 3.5,
    reviewCount: 88,
    category: 'jeans',
    dressStyle: 'casual',
    gender: 'men',
    images: [
      '/images/categories/jeans.webp',
    ],
    colors: [
      { name: 'Indigo Blue', hex: '#2563EB' },
      { name: 'Deep Black', hex: '#1F2937' },
      { name: 'Light Washed Blue', hex: '#60A5FA' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'],
    isNewArrival: true,
    details: ['98% Cotton, 2% Elastane', '5-pocket classic styling', 'Custom brass hardware'],
    faqs: [
      { question: 'How much stretch do these jeans have?', answer: 'Engineered with 2% elastane for comfortable 4-way stretch.' }
    ],
    reviews: MOCK_REVIEWS.slice(1, 4),
  },

  // 4. APPAREL - Vertical Striped Shirt
  {
    id: 'vertical-striped-shirt',
    name: 'Vertical Striped Shirt',
    slug: 'vertical-striped-shirt',
    description:
      'Contemporary vertical striped button-up shirt in moss green and white. Features a band collar and breathable linen-cotton blend.',
    price: 212,
    originalPrice: 235,
    discountPercent: 20,
    rating: 5.0,
    reviewCount: 340,
    category: 'shirts',
    dressStyle: 'casual',
    gender: 'men',
    images: [
      '/images/categories/shirts.webp',
    ],
    colors: [
      { name: 'Sage Green', hex: '#4B5320' },
      { name: 'Sky Blue', hex: '#38BDF8' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large'],
    isTopSelling: true,
    details: ['55% Linen, 45% Cotton', 'Mandarin band collar', 'Natural coconut shell buttons'],
    faqs: [
      { question: 'Is it machine washable?', answer: 'Yes, gentle cycle with cold water is recommended.' }
    ],
    reviews: MOCK_REVIEWS,
  },

  // 5. APPAREL - Courage Graphic T-shirt
  {
    id: 'courage-graphic-tshirt',
    name: 'Courage Graphic T-shirt',
    slug: 'courage-graphic-tshirt',
    description:
      'Bold sunset orange graphic tee with vibrant cyan typography. Features dropped shoulders and heavyweight cotton feel.',
    price: 145,
    rating: 4.0,
    reviewCount: 95,
    category: 't-shirts',
    dressStyle: 'casual',
    gender: 'men',
    images: [
      '/images/categories/tshirts.webp',
      '/images/categories/tshirt_white.webp',
    ],
    colors: [
      { name: 'Burnt Orange', hex: '#EA580C' },
      { name: 'Charcoal Black', hex: '#18181B' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large'],
    isTopSelling: true,
    details: ['100% Ring-spun cotton', 'Distressed typography artwork', 'Ribbed crewneck'],
    faqs: [],
    reviews: MOCK_REVIEWS.slice(0, 4),
  },

  // 6. APPAREL - Gradient Graphic T-shirt
  {
    id: 'gradient-graphic-tshirt',
    name: 'Gradient Graphic T-shirt',
    slug: 'gradient-graphic-tshirt',
    description:
      'Bright white t-shirt featuring vibrant prism watercolor spray artwork and modern typography. Statement piece for summer.',
    price: 145,
    originalPrice: 242,
    discountPercent: 20,
    rating: 3.5,
    reviewCount: 65,
    category: 't-shirts',
    dressStyle: 'casual',
    gender: 'unisex',
    images: [
      '/images/categories/tshirts.webp',
      '/images/categories/tshirt_white.webp',
    ],
    colors: [
      { name: 'Optical White', hex: '#FFFFFF' },
      { name: 'Pale Lavender', hex: '#E9D5FF' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'],
    isNewArrival: true,
    details: ['100% Combed Cotton', 'Direct-to-garment gradient print', 'Soft wash finish'],
    faqs: [],
    reviews: MOCK_REVIEWS.slice(0, 3),
  },

  // 7. FOOTWEAR - Minimalist Leather Sneakers
  {
    id: 'minimalist-leather-sneakers',
    name: 'Minimalist Low-Top Sneakers',
    slug: 'minimalist-leather-sneakers',
    description:
      'Handcrafted Italian full-grain nappa leather low-top sneakers with vulcanized rubber cupsole and cushioned memory foam insole.',
    price: 195,
    originalPrice: 245,
    discountPercent: 20,
    rating: 4.8,
    reviewCount: 215,
    category: 'footwear',
    dressStyle: 'casual',
    gender: 'unisex',
    images: [
      '/images/categories/footwear.webp',
    ],
    colors: [
      { name: 'Chalk White', hex: '#FAFAFA' },
      { name: 'Monochrome Black', hex: '#111827' },
      { name: 'Tan Suede', hex: '#D4A373' },
    ],
    sizes: ['US 8', 'US 9', 'US 10', 'US 11'],
    isNewArrival: true,
    details: ['100% Italian Nappa Leather', 'Hand-stitched margom rubber sole', 'Waxed cotton laces'],
    faqs: [
      { question: 'Do these run true to size?', answer: 'Yes, fits true to standard US sneaker sizing.' }
    ],
    reviews: MOCK_REVIEWS.slice(1, 5),
  },

  // 8. FOOTWEAR - Urban Athletic Runners
  {
    id: 'urban-athletic-runners',
    name: 'AeroGlide Running Shoes',
    slug: 'urban-athletic-runners',
    description:
      'Featherweight engineered mesh athletic trainers with reactive carbon-infused foam midsole providing maximum energy return.',
    price: 165,
    originalPrice: 210,
    discountPercent: 20,
    rating: 4.7,
    reviewCount: 178,
    category: 'footwear',
    dressStyle: 'gym',
    gender: 'unisex',
    images: [
      '/images/categories/footwear.webp',
    ],
    colors: [
      { name: 'Solar Red', hex: '#EF4444' },
      { name: 'Triple Black', hex: '#09090B' },
      { name: 'Neon Lime', hex: '#84CC16' },
    ],
    sizes: ['US 8', 'US 9', 'US 10', 'US 11'],
    isTopSelling: true,
    details: ['Breathable engineered jacquard knit', 'Reactive TPU foam cushioning', 'High-abrasion rubber outsole'],
    faqs: [],
    reviews: MOCK_REVIEWS,
  },

  // 9. ELECTRONICS - Wireless ANC Headphones
  {
    id: 'wireless-anc-headphones',
    name: 'Spatial Studio Wireless Headphones',
    slug: 'wireless-anc-headphones',
    description:
      'High-fidelity wireless over-ear headphones featuring Hybrid Active Noise Cancellation, 40mm beryllium drivers, and 45-hour ultra-long battery life.',
    price: 299,
    originalPrice: 380,
    discountPercent: 20,
    rating: 4.9,
    reviewCount: 520,
    category: 'electronics',
    dressStyle: 'casual',
    gender: 'unisex',
    images: [
      '/images/categories/accessories.webp',
    ],
    colors: [
      { name: 'Space Black', hex: '#18181B' },
      { name: 'Silver Aluminum', hex: '#E2E8F0' },
      { name: 'Rose Gold', hex: '#FBCFE8' },
    ],
    sizes: ['One Size'],
    isTopSelling: true,
    details: [
      'Custom 40mm Beryllium acoustic drivers',
      'Hybrid Active Noise Cancellation with Transparency mode',
      'Up to 45 hours playtime with USB-C quick charge (15m = 5hrs)',
      'Multi-point Bluetooth 5.3 pairing',
    ],
    faqs: [
      { question: 'Is it compatible with iOS and Android?', answer: 'Yes, seamlessly pairs with any Bluetooth-enabled smartphone, tablet, or PC.' },
      { question: 'Does it come with a carrying case?', answer: 'Yes, includes a premium hard-shell travel case and audio cable.' },
    ],
    reviews: MOCK_REVIEWS,
  },

  // 10. ELECTRONICS - Minimalist Smartwatch
  {
    id: 'minimalist-smartwatch',
    name: 'Horizon OLED Smart Watch',
    slug: 'minimalist-smartwatch',
    description:
      'Titanium frame smartwatch with edge-to-edge AMOLED sapphire display, 24/7 biometric health sensors, GPS tracking, and 7-day battery.',
    price: 349,
    originalPrice: 420,
    discountPercent: 15,
    rating: 4.8,
    reviewCount: 310,
    category: 'electronics',
    dressStyle: 'formal',
    gender: 'unisex',
    images: [
      '/images/categories/accessories.webp',
    ],
    colors: [
      { name: 'Matte Black', hex: '#18181B' },
      { name: 'Brushed Silver', hex: '#E5E7EB' },
    ],
    sizes: ['One Size'],
    isNewArrival: true,
    details: ['1.4" Always-On AMOLED Sapphire Glass', 'Aerospace-grade grade 5 titanium case', '50m Water Resistant (5 ATM)'],
    faqs: [],
    reviews: MOCK_REVIEWS.slice(0, 4),
  },

  // 11. ACCESSORIES - Polarized Acetate Sunglasses
  {
    id: 'polarized-acetate-sunglasses',
    name: 'Classic Havana Polarized Sunglasses',
    slug: 'polarized-acetate-sunglasses',
    description:
      'Timeless square-frame sunglasses handcrafted from premium Italian Mazzucchelli acetate with 100% UV400 polarized scratch-resistant lenses.',
    price: 135,
    originalPrice: 170,
    discountPercent: 20,
    rating: 4.6,
    reviewCount: 142,
    category: 'accessories',
    dressStyle: 'casual',
    gender: 'unisex',
    images: [
      '/images/categories/accessories.webp',
    ],
    colors: [
      { name: 'Tortoise Havana', hex: '#78350F' },
      { name: 'Glossy Black', hex: '#09090B' },
    ],
    sizes: ['One Size'],
    isTopSelling: true,
    details: ['Italian Mazzucchelli Acetate', 'UVA/UVB Category 3 Polarized optics', 'German 5-barrel OBE hinges'],
    faqs: [],
    reviews: MOCK_REVIEWS.slice(1, 4),
  },

  // 12. ACCESSORIES - Full Grain Leather Backpack
  {
    id: 'full-grain-leather-backpack',
    name: 'Executive Leather Commuter Backpack',
    slug: 'full-grain-leather-backpack',
    description:
      'Sleek water-resistant full-grain leather everyday backpack with padded 16-inch laptop compartment and ergonomic luggage pass-through.',
    price: 245,
    originalPrice: 299,
    discountPercent: 18,
    rating: 4.9,
    reviewCount: 189,
    category: 'accessories',
    dressStyle: 'formal',
    gender: 'unisex',
    images: [
      '/images/categories/accessories.webp',
    ],
    colors: [
      { name: 'Espresso Brown', hex: '#451A03' },
      { name: 'Obsidian Black', hex: '#18181B' },
      { name: 'Caramel Tan', hex: '#B45309' },
    ],
    sizes: ['One Size'],
    isNewArrival: true,
    details: ['Vegetable-tanned full-grain cowhide leather', 'Padded 16" MacBook Pro sleeve', 'YKK Excella metal zippers'],
    faqs: [],
    reviews: MOCK_REVIEWS,
  },

  // 13. APPAREL - Checkered Shirt
  {
    id: 'checkered-shirt',
    name: 'Checkered Shirt',
    slug: 'checkered-shirt',
    description:
      'Classic red, navy, and white tartan plaid flannel shirt. Soft brushed surface with dual chest pockets and relaxed tailoring.',
    price: 180,
    rating: 4.5,
    reviewCount: 230,
    category: 'shirts',
    dressStyle: 'casual',
    gender: 'men',
    images: [
      '/images/categories/shirts.webp',
    ],
    colors: [
      { name: 'Red Plaid', hex: '#B91C1C' },
      { name: 'Blue Plaid', hex: '#1D4ED8' },
      { name: 'Green Plaid', hex: '#047857' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'],
    details: ['100% Brushed Cotton Flannel', 'Button-down collar', 'Curved hemline'],
    faqs: [],
    reviews: MOCK_REVIEWS,
  },

  // 14. APPAREL - Polo with Contrast Trims
  {
    id: 'polo-contrast-trims',
    name: 'Polo with Contrast Trims',
    slug: 'polo-contrast-trims',
    description:
      'Deep ocean cyan polo shirt with pristine white collar and shoulder trim inserts. Crisp, tailored smart-casual look.',
    price: 212,
    originalPrice: 242,
    discountPercent: 20,
    rating: 4.0,
    reviewCount: 97,
    category: 'shirts',
    dressStyle: 'formal',
    gender: 'men',
    images: [
      '/images/categories/shirts.webp',
    ],
    colors: [
      { name: 'Ocean Cyan', hex: '#0284C7' },
      { name: 'Royal Navy', hex: '#1E3A8A' },
      { name: 'Jet Black', hex: '#09090B' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large'],
    details: ['100% Double Mercerized Cotton', 'Structured spread collar', 'Side vents'],
    faqs: [],
    reviews: MOCK_REVIEWS,
  },

  // 15. APPAREL - Formal Tailored Blazer
  {
    id: 'formal-tailored-blazer',
    name: 'Formal Tailored Blazer',
    slug: 'formal-tailored-blazer',
    description:
      'Impeccably tailored slim fit blazer in navy windowpane check. Perfect for upscale occasions, boardrooms, and galas.',
    price: 320,
    originalPrice: 399,
    discountPercent: 20,
    rating: 4.9,
    reviewCount: 312,
    category: 'shirts',
    dressStyle: 'formal',
    gender: 'men',
    images: [
      '/images/styles/formal.webp',
    ],
    colors: [
      { name: 'Midnight Navy', hex: '#1E3A8A' },
      { name: 'Charcoal Wool', hex: '#374151' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'],
    details: ['70% Wool, 30% Silk blend', 'Notch lapel and double rear vent', 'Full silk lining'],
    faqs: [],
    reviews: MOCK_REVIEWS,
  },

  // 16. APPAREL - Gym Performance Tank
  {
    id: 'gym-compression-tank',
    name: 'Gym Performance Muscle Tank',
    slug: 'gym-compression-tank',
    description:
      'High-performance muscle tank with moisture-wicking Dri-Fit technology and deep armholes for unlimited range of motion during heavy workouts.',
    price: 65,
    rating: 4.7,
    reviewCount: 289,
    category: 't-shirts',
    dressStyle: 'gym',
    gender: 'men',
    images: [
      '/images/styles/gym.webp',
      '/images/categories/shorts.webp',
    ],
    colors: [
      { name: 'Deep Navy', hex: '#1E3A8A' },
      { name: 'Stealth Black', hex: '#09090B' },
      { name: 'Heather Grey', hex: '#9CA3AF' },
    ],
    sizes: ['Small', 'Medium', 'Large', 'X-Large'],
    details: ['88% Polyester, 12% Spandex', 'Anti-odor antimicrobial treatment', 'Flatlock anti-chafe seams'],
    faqs: [],
    reviews: MOCK_REVIEWS,
  },
];

export const CATEGORIES_LIST = [
  { label: 'T-shirts', slug: 't-shirts' },
  { label: 'Shorts', slug: 'shorts' },
  { label: 'Shirts', slug: 'shirts' },
  { label: 'Hoodie', slug: 'hoodie' },
  { label: 'Jeans', slug: 'jeans' },
  { label: 'Footwear', slug: 'footwear' },
  { label: 'Accessories', slug: 'accessories' },
  { label: 'Electronics', slug: 'electronics' },
];

export const DRESS_STYLES = [
  {
    name: 'Casual',
    slug: 'casual',
    image: '/images/styles/casual.webp',
  },
  {
    name: 'Formal',
    slug: 'formal',
    image: '/images/styles/formal.webp',
  },
  {
    name: 'Party',
    slug: 'party',
    image: '/images/styles/party.webp',
  },
  {
    name: 'Gym',
    slug: 'gym',
    image: '/images/styles/gym.webp',
  },
];

export const FILTER_COLORS = [
  { name: 'Green', hex: '#00C12B' },
  { name: 'Red', hex: '#F50606' },
  { name: 'Yellow', hex: '#F5DD06' },
  { name: 'Orange', hex: '#F57906' },
  { name: 'Cyan', hex: '#06CAF5' },
  { name: 'Blue', hex: '#063AF5' },
  { name: 'Purple', hex: '#7D06F5' },
  { name: 'Pink', hex: '#F506A4' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#000000' },
];

export const FILTER_SIZES = [
  'XX-Small',
  'X-Small',
  'Small',
  'Medium',
  'Large',
  'X-Large',
  'XX-Large',
  '3X-Large',
  '4X-Large',
  'One Size',
  'US 8',
  'US 9',
  'US 10',
  'US 11',
];
