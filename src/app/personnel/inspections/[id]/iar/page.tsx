'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { IarReportView } from '../../components/iar-report-view';
import IarReportLoading from './loading';

export default function IarReportPage() {
  return (
    <Suspense fallback={<IarReportLoading />}>
      <IarReportContent />
    </Suspense>
  );
}

function IarReportContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  return (
    <IarReportView
      deliveryParam={id}
      recordParam={searchParams.get('record')}
    />
  );
}
