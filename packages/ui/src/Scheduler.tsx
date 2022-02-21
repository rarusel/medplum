import { getReferenceString, Operator } from '@medplum/core';
import { BundleEntry, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { CalendarInput } from './CalendarInput';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';
import './Scheduler.css';
import { useResource } from './useResource';

export interface SchedulerProps {
  schedule: Schedule | Reference<Schedule>;
}

export function Scheduler(props: SchedulerProps): JSX.Element | null {
  const medplum = useMedplum();
  const schedule = useResource(props.schedule);

  const [slots, setSlots] = useState<Slot[]>();
  const slotsRef = useRef<Slot[]>();
  slotsRef.current = slots;

  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [form, setForm] = useState<string>();

  useEffect(() => {
    if (schedule) {
      medplum
        .search({
          resourceType: 'Slot',
          filters: [
            {
              code: 'schedule',
              operator: Operator.EQUALS,
              value: getReferenceString(schedule),
            },
          ],
        })
        .then((bundle) => {
          setSlots((bundle.entry as BundleEntry<Slot>[]).map((entry) => entry.resource as Slot));
        });
    } else {
      setSlots(undefined);
    }
  }, [schedule]);

  if (!schedule || !slots) {
    return null;
  }

  const actor = schedule.actor?.[0];

  return (
    <div className="medplum-calendar-container" data-testid="scheduler">
      <div className="medplum-calendar-info-pane">
        {actor && <Avatar value={actor} size="large" />}
        {actor && (
          <h1>
            <ResourceName value={actor} />
          </h1>
        )}
        <p>1 hour</p>
        {date && <p>{date.toLocaleDateString()}</p>}
        {time && <p>{time}</p>}
      </div>
      <div className="medplum-calendar-selection-pane">
        {!date && (
          <div>
            <h3>Select date</h3>
            <CalendarInput slots={slots} onClick={setDate} />
          </div>
        )}
        {date && !time && (
          <div>
            <h3>Select time</h3>
            <Button onClick={() => setTime('9:00am')}>9:00am</Button>
          </div>
        )}
        {date && time && !info && (
          <div>
            <h3>Enter your info</h3>
            <FormSection title="Name" htmlFor="name">
              <Input name="name" />
            </FormSection>
            <FormSection title="Email" htmlFor="email">
              <Input name="email" />
            </FormSection>
            <Button primary={true} onClick={() => setInfo('info')}>
              Next
            </Button>
          </div>
        )}
        {date && time && info && !form && (
          <div>
            <h3>Custom questions</h3>
            <FormSection title="Question 1" htmlFor="q1">
              <Input name="q1" />
            </FormSection>
            <FormSection title="Question 2" htmlFor="q2">
              <Input name="email" />
            </FormSection>
            <FormSection title="Question 3" htmlFor="q3">
              <Input name="email" />
            </FormSection>
            <Button primary={true} onClick={() => setForm('form')}>
              Next
            </Button>
          </div>
        )}
        {date && time && info && form && (
          <div>
            <h3>You're all set!</h3>
            <p>Check your email for a calendar invite.</p>
          </div>
        )}
      </div>
    </div>
  );
}