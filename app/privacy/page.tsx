import type { Metadata } from 'next';
import { ContentPage } from '@/components/content/ContentPage';
import { PRIVACY } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Privacy policy | SHOP.CO',
  description: 'What personal information SHOP.CO collects, why, and your choices.',
};

export default function PrivacyPage() {
  return <ContentPage title="Privacy policy" intro={PRIVACY.intro} sections={PRIVACY.sections} />;
}
