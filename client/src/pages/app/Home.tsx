import { Clock } from 'lucide-react';
import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export default function AppHomePage() {
  return <PlaceholderPage title={'Accueil'} description={'Votre journée de travail.'} icon={Clock} compact />;
}
