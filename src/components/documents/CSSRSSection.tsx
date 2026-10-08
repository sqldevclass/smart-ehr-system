import YesNoRadio from "./YesNoRadio";

// Fixed field_definition ids -- must match the migration that creates
// these field_definitions (cssrs.q1_wish_dead ... cssrs.q7_recent_attempt).
const CSSRS_Q1 = "e1000000-0000-0000-0000-000000000201";
const CSSRS_Q2 = "e1000000-0000-0000-0000-000000000202";
const CSSRS_Q3 = "e1000000-0000-0000-0000-000000000203";
const CSSRS_Q4 = "e1000000-0000-0000-0000-000000000204";
const CSSRS_Q5 = "e1000000-0000-0000-0000-000000000205";
const CSSRS_Q6 = "e1000000-0000-0000-0000-000000000206";
const CSSRS_Q7 = "e1000000-0000-0000-0000-000000000207";

const QUESTIONS: { id: string; text: string }[] = [
  { id: CSSRS_Q1, text: "1. Хотели ли Вы когда-нибудь умереть? Или уснуть и не проснуться?" },
  { id: CSSRS_Q2, text: "2. Были ли у Вас когда-либо мысли о самоубийстве?" },
  { id: CSSRS_Q3, text: "3. Обдумывали ли Вы о том как могли бы сделать это?" },
  { id: CSSRS_Q4, text: "4. Были ли у Вас намерения эти мысли исполнить?" },
  { id: CSSRS_Q5, text: "5. Обдумывали ли Вы детали как осуществить план или как покончить жизнь?" },
  { id: CSSRS_Q6, text: "6. Когда-то в прошлом, делали ли Вы что-то или готовы были сделать что-то чтобы покончить с собой?" },
  { id: CSSRS_Q7, text: "7. В последние 3 месяца делали ли Вы что-то или готовы были сделать что-то чтобы покончить с собой?" },
];

interface Props {
  values: Record<string, string>;
  setVal: (id: string, val: string) => void;
  isReadOnly: boolean;
}

function QuestionRow({
  question,
  value,
  setVal,
  isReadOnly,
}: {
  question: { id: string; text: string };
  value: string | undefined;
  setVal: (id: string, val: string) => void;
  isReadOnly: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm">{question.text}</div>
      {isReadOnly ? (
        <div className="text-sm py-1">
          {value === "true" || value === "false" ? (
            <span className="font-medium">{value === "true" ? "Да" : "Нет"}</span>
          ) : (
            <span className="italic text-sm text-muted-foreground">Не заполнено</span>
          )}
        </div>
      ) : (
        <YesNoRadio
          value={value}
          onValueChange={(v) => setVal(question.id, v)}
          idPrefix={question.id}
        />
      )}
    </div>
  );
}

export default function CSSRSSection({ values, setVal, isReadOnly }: Props) {
  const q1 = values[CSSRS_Q1];
  const q2 = values[CSSRS_Q2];
  const q4 = values[CSSRS_Q4];
  const q5 = values[CSSRS_Q5];
  const q6 = values[CSSRS_Q6];

  // Questions 3-5 only apply when there's any wish-to-die or suicidal
  // ideation at all (Q1 or Q2 = Да); otherwise the scale skips
  // straight to Q6, per the standard C-SSRS screening flow.
  const showQ3to5 = q1 === "true" || q2 === "true";

  // High-risk flag: intent AND a plan, or any past attempt.
  const showAlert = (q4 === "true" && q5 === "true") || q6 === "true";

  return (
    <div className="space-y-4 mt-8 pt-6 border-t border-gray-200">
      <h3 className="font-heading text-base font-semibold">
        Шкала оценки риска суицида (The Columbia-Suicide Severity Rating Scale (C-SSRS))
      </h3>
      <div className="space-y-4">
        <QuestionRow question={QUESTIONS[0]} value={q1} setVal={setVal} isReadOnly={isReadOnly} />
        <QuestionRow question={QUESTIONS[1]} value={q2} setVal={setVal} isReadOnly={isReadOnly} />
        {showQ3to5 && (
          <>
            <QuestionRow question={QUESTIONS[2]} value={values[CSSRS_Q3]} setVal={setVal} isReadOnly={isReadOnly} />
            <QuestionRow question={QUESTIONS[3]} value={q4} setVal={setVal} isReadOnly={isReadOnly} />
            <QuestionRow question={QUESTIONS[4]} value={q5} setVal={setVal} isReadOnly={isReadOnly} />
          </>
        )}
        <QuestionRow question={QUESTIONS[5]} value={q6} setVal={setVal} isReadOnly={isReadOnly} />
        <QuestionRow question={QUESTIONS[6]} value={values[CSSRS_Q7]} setVal={setVal} isReadOnly={isReadOnly} />
      </div>
      {showAlert && (
        <div className="p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm font-medium">
          ⚠ Срочная консультация психолога/психиатра (в течение 48 часов) — пациент всегда должен быть под наблюдением
        </div>
      )}
    </div>
  );
}
