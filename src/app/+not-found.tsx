import { router } from 'expo-router';
import { Button, Card, Page, PageHeader } from '@/components/ui';

export default function NotFound() {
  return (
    <Page>
      <PageHeader title="Page not found" subtitle="That address is not part of CHC Artists." />
      <Card>
        <Button kind="primary" label="Go to submissions" onPress={() => router.replace('/submission')} />
      </Card>
    </Page>
  );
}
