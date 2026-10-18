import type { Metadata } from 'next';
import { ContentPage } from '@/components/content/ContentPage';
import { ContactDetails } from '@/components/content/ContactDetails';

export const metadata: Metadata = {
  title: 'Contact us | SHOP.CO',
  description: 'Email, WhatsApp and phone details for SHOP.CO customer support.',
};

export default function ContactPage() {
  return (
    <ContentPage title="Contact us" intro="Questions about an order, sizing or a return? Reach us using the details below.">
      <ContactDetails />
    </ContentPage>
  );
}
