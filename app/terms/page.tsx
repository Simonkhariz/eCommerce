import type { Metadata } from 'next';
import { ContentPage } from '@/components/content/ContentPage';
import { TERMS } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Terms & conditions | SHOP.CO',
  description: 'How ordering, payment, stock, promo codes and refunds work at SHOP.CO.',
};

export default function TermsPage() {
  return <ContentPage title="Terms & conditions" intro={TERMS.intro} sections={TERMS.sections} />;
}
