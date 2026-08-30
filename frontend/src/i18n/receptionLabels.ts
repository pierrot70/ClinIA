const translations: Record<string, Record<string, string>> = {
  en: {
    selectionTitle: "Where are you working today?",
    selectionDescription: "Choose the active clinic before continuing. This selection will be used for walk-in arrivals.",
    loading: "Loading your clinics…",
    active: "Active clinic: {name}",
    change: "Change",
    title: "Walk-in arrival",
    description: "Step 1: identify the patient by health insurance number and choose the arrival clinic.",
    ramqLabel: "Health insurance number",
    searchPatient: "Search for patient",
    assignedClinic: "Assigned clinic: {name}",
    searchAvailability: "View available appointments",
    availabilityLoading: "Searching for appointments…",
    noPatient: "No active patient was found for this health insurance number.",
    selectPatient: "Select",
    selectedPatient: "Selected patient: {name}",
    existingPatientDescription: "Present the available appointments to the patient before creating an appointment.",
    newPatientTitle: "New patient",
    newPatientDescription: "No patient record has been created yet. Present the available appointments to the patient first.",
    availabilityIntro: "The patient record and appointment will only be created after a time is accepted.",
    availabilityToday: "Doctors available today",
    availabilityFuture: "Next available appointments",
    noSameDayAvailability: "No family doctor is available today at this clinic.",
    noFutureAvailability: "No other future appointment is available at this clinic.",
    chooseSlot: "Choose this appointment",
  },
  es: { active: "Clínica activa: {name}", change: "Cambiar", title: "Llegada sin cita", description: "Paso 1: identifique al paciente por su número de seguro médico y elija la clínica de llegada.", ramqLabel: "Número de seguro médico", searchPatient: "Buscar paciente", assignedClinic: "Clínica asignada: {name}", searchAvailability: "Ver citas disponibles", noPatient: "No se encontró ningún paciente activo para este número de seguro médico.", selectPatient: "Seleccionar", selectedPatient: "Paciente seleccionado: {name}", existingPatientDescription: "Presente las citas disponibles al paciente antes de crear una cita.", newPatientTitle: "Paciente nuevo", newPatientDescription: "Aún no se ha creado ningún expediente. Primero presente las citas disponibles al paciente." },
  vi: { active: "Phòng khám đang hoạt động: {name}", change: "Thay đổi", title: "Tiếp nhận không hẹn", description: "Bước 1: xác định bệnh nhân bằng số bảo hiểm y tế và chọn phòng khám tiếp nhận.", ramqLabel: "Số bảo hiểm y tế", searchPatient: "Tìm bệnh nhân", assignedClinic: "Phòng khám được chỉ định: {name}", searchAvailability: "Xem lịch hẹn còn trống", noPatient: "Không tìm thấy bệnh nhân đang hoạt động với số bảo hiểm y tế này.", selectPatient: "Chọn", selectedPatient: "Bệnh nhân đã chọn: {name}", existingPatientDescription: "Trình bày các lịch hẹn còn trống cho bệnh nhân trước khi tạo lịch hẹn.", newPatientTitle: "Bệnh nhân mới", newPatientDescription: "Chưa có hồ sơ bệnh nhân nào được tạo. Hãy trình bày các lịch hẹn còn trống cho bệnh nhân trước." },
  no: { active: "Aktiv klinikk: {name}", change: "Endre", title: "Oppmøte uten timeavtale", description: "Trinn 1: identifiser pasienten med helseforsikringsnummeret og velg ankomstklinikken.", ramqLabel: "Helseforsikringsnummer", searchPatient: "Søk etter pasient", assignedClinic: "Tildelt klinikk: {name}", searchAvailability: "Vis ledige timer", noPatient: "Ingen aktiv pasient ble funnet for dette helseforsikringsnummeret.", selectPatient: "Velg", selectedPatient: "Valgt pasient: {name}", existingPatientDescription: "Vis pasienten ledige timer før du oppretter en avtale.", newPatientTitle: "Ny pasient", newPatientDescription: "Ingen pasientjournal er opprettet ennå. Vis først pasienten de ledige timene." },
  ja: { active: "利用中のクリニック: {name}", change: "変更", title: "予約なし来院", description: "ステップ1：医療保険番号で患者を特定し、来院先のクリニックを選択します。", ramqLabel: "医療保険番号", searchPatient: "患者を検索", assignedClinic: "指定クリニック: {name}", searchAvailability: "空き時間を表示", noPatient: "この医療保険番号に該当する有効な患者は見つかりませんでした。", selectPatient: "選択", selectedPatient: "選択した患者: {name}", existingPatientDescription: "予約を作成する前に、利用可能な時間を患者に提示してください。", newPatientTitle: "新規患者", newPatientDescription: "患者記録はまだ作成されていません。まず患者に利用可能な予約を提示してください。" },
  zh: { active: "当前诊所：{name}", change: "更改", title: "无预约到诊", description: "第1步：通过医疗保险号码识别患者，并选择到诊诊所。", ramqLabel: "医疗保险号码", searchPatient: "搜索患者", assignedClinic: "指定诊所：{name}", searchAvailability: "查看可用预约", noPatient: "未找到与该医疗保险号码对应的有效患者。", selectPatient: "选择", selectedPatient: "已选择患者：{name}", existingPatientDescription: "创建预约前，请向患者展示可用预约。", newPatientTitle: "新患者", newPatientDescription: "尚未创建患者记录。请先向患者展示可用预约。" },
  he: { active: "מרפאה פעילה: {name}", change: "שינוי", title: "הגעה ללא תור", description: "שלב 1: זיהוי המטופל לפי מספר ביטוח הבריאות ובחירת מרפאת ההגעה.", ramqLabel: "מספר ביטוח בריאות", searchPatient: "חיפוש מטופל", assignedClinic: "מרפאה שהוקצתה: {name}", searchAvailability: "הצגת תורים פנויים", noPatient: "לא נמצא מטופל פעיל עבור מספר ביטוח בריאות זה.", selectPatient: "בחירה", selectedPatient: "מטופל שנבחר: {name}", existingPatientDescription: "הצג למטופל את התורים הפנויים לפני יצירת תור.", newPatientTitle: "מטופל חדש", newPatientDescription: "טרם נוצר תיק מטופל. הצג תחילה למטופל את התורים הפנויים." },
  ko: { active: "활성 진료소: {name}", change: "변경", title: "예약 없이 방문", description: "1단계: 건강보험 번호로 환자를 확인하고 방문 진료소를 선택합니다.", ramqLabel: "건강보험 번호", searchPatient: "환자 검색", assignedClinic: "지정 진료소: {name}", searchAvailability: "예약 가능 시간 보기", noPatient: "이 건강보험 번호에 해당하는 활성 환자를 찾을 수 없습니다.", selectPatient: "선택", selectedPatient: "선택한 환자: {name}", existingPatientDescription: "예약을 만들기 전에 환자에게 가능한 예약 시간을 안내하세요.", newPatientTitle: "신규 환자", newPatientDescription: "아직 환자 기록이 생성되지 않았습니다. 먼저 환자에게 가능한 예약 시간을 안내하세요." },
};

const availabilityTranslations: Record<string, Record<string, string>> = {
  es: { availabilityIntro: "El expediente y la cita solo se crearán después de aceptar un horario.", availabilityToday: "Médicos disponibles hoy", availabilityFuture: "Próximas citas disponibles", noSameDayAvailability: "No hay médico de familia disponible hoy en esta clínica.", noFutureAvailability: "No hay otra cita futura disponible en esta clínica.", chooseSlot: "Elegir esta cita" },
  vi: { availabilityIntro: "Hồ sơ và lịch hẹn chỉ được tạo sau khi chấp nhận một khung giờ.", availabilityToday: "Bác sĩ có mặt hôm nay", availabilityFuture: "Các lịch hẹn trống tiếp theo", noSameDayAvailability: "Không có bác sĩ gia đình nào làm việc hôm nay tại phòng khám này.", noFutureAvailability: "Không có lịch hẹn nào khác trong tương lai tại phòng khám này.", chooseSlot: "Chọn lịch hẹn này" },
  no: { availabilityIntro: "Pasientjournalen og timen opprettes først etter at et tidspunkt er akseptert.", availabilityToday: "Leger tilgjengelig i dag", availabilityFuture: "Neste ledige timer", noSameDayAvailability: "Ingen fastlege er tilgjengelig i dag ved denne klinikken.", noFutureAvailability: "Ingen annen fremtidig time er tilgjengelig ved denne klinikken.", chooseSlot: "Velg denne timen" },
  ja: { availabilityIntro: "患者記録と予約は、時間枠が承諾された後にのみ作成されます。", availabilityToday: "本日対応可能な医師", availabilityFuture: "今後の空き予約", noSameDayAvailability: "このクリニックでは本日対応可能な家庭医はいません。", noFutureAvailability: "このクリニックには今後利用可能な予約はありません。", chooseSlot: "この予約を選択" },
  zh: { availabilityIntro: "只有在接受时间后才会创建患者记录和预约。", availabilityToday: "今日可接诊医生", availabilityFuture: "接下来的可用预约", noSameDayAvailability: "该诊所今天没有可接诊的家庭医生。", noFutureAvailability: "该诊所没有其他未来可用预约。", chooseSlot: "选择此预约" },
  he: { availabilityIntro: "תיק המטופל והתור ייווצרו רק לאחר קבלת מועד.", availabilityToday: "רופאים זמינים היום", availabilityFuture: "התורים הפנויים הבאים", noSameDayAvailability: "אין רופא משפחה זמין היום במרפאה זו.", noFutureAvailability: "אין תור עתידי נוסף זמין במרפאה זו.", chooseSlot: "בחירת תור זה" },
  ko: { availabilityIntro: "시간을 수락한 후에만 환자 기록과 예약이 생성됩니다.", availabilityToday: "오늘 진료 가능한 의사", availabilityFuture: "다음 예약 가능 시간", noSameDayAvailability: "이 진료소에는 오늘 진료 가능한 가정의가 없습니다.", noFutureAvailability: "이 진료소에는 향후 가능한 다른 예약이 없습니다.", chooseSlot: "이 예약 선택" },
};

const confirmationTranslations: Record<string, Record<string, string>> = {
  en: { existingPatientFormTitle: "Confirm appointment", existingPatientFormDescription: "The appointment time will be checked again before it is saved.", selectedSlot: "Selected appointment: {specialist}, on {date} at {time}", existingPatientLabel: "Patient: {name}", backToAvailability: "Back to appointments", createAppointment: "Create appointment", existingBookingCreated: "The appointment was created." },
  es: { existingPatientFormTitle: "Confirmar la cita", existingPatientFormDescription: "La cita se validará de nuevo antes de guardarla.", selectedSlot: "Cita elegida: {specialist}, el {date} a las {time}", existingPatientLabel: "Paciente: {name}", backToAvailability: "Volver a las citas", createAppointment: "Crear la cita", existingBookingCreated: "La cita fue creada." },
  vi: { existingPatientFormTitle: "Xác nhận lịch hẹn", existingPatientFormDescription: "Khung giờ sẽ được kiểm tra lại trước khi lưu.", selectedSlot: "Lịch hẹn đã chọn: {specialist}, ngày {date} lúc {time}", existingPatientLabel: "Bệnh nhân: {name}", backToAvailability: "Quay lại lịch hẹn", createAppointment: "Tạo lịch hẹn", existingBookingCreated: "Lịch hẹn đã được tạo." },
  no: { existingPatientFormTitle: "Bekreft time", existingPatientFormDescription: "Tidspunktet kontrolleres på nytt før lagring.", selectedSlot: "Valgt time: {specialist}, {date} kl. {time}", existingPatientLabel: "Pasient: {name}", backToAvailability: "Tilbake til timer", createAppointment: "Opprett time", existingBookingCreated: "Timen ble opprettet." },
  ja: { existingPatientFormTitle: "予約を確認", existingPatientFormDescription: "保存前に時間枠を再確認します。", selectedSlot: "選択した予約: {specialist}、{date} {time}", existingPatientLabel: "患者: {name}", backToAvailability: "予約に戻る", createAppointment: "予約を作成", existingBookingCreated: "予約が作成されました。" },
  zh: { existingPatientFormTitle: "确认预约", existingPatientFormDescription: "保存前将再次验证预约时间。", selectedSlot: "已选预约：{specialist}，{date} {time}", existingPatientLabel: "患者：{name}", backToAvailability: "返回预约", createAppointment: "创建预约", existingBookingCreated: "预约已创建。" },
  he: { existingPatientFormTitle: "אישור תור", existingPatientFormDescription: "מועד התור ייבדק שוב לפני השמירה.", selectedSlot: "תור שנבחר: {specialist}, {date} בשעה {time}", existingPatientLabel: "מטופל: {name}", backToAvailability: "חזרה לתורים", createAppointment: "יצירת תור", existingBookingCreated: "התור נוצר." },
  ko: { existingPatientFormTitle: "예약 확인", existingPatientFormDescription: "저장하기 전에 예약 시간이 다시 확인됩니다.", selectedSlot: "선택한 예약: {specialist}, {date} {time}", existingPatientLabel: "환자: {name}", backToAvailability: "예약으로 돌아가기", createAppointment: "예약 만들기", existingBookingCreated: "예약이 생성되었습니다." },
};

const newPatientFormTranslations: Record<string, Record<string, string>> = {
  en: { newPatientFormTitle: "Create patient record and appointment", newPatientFormDescription: "Enter the patient's minimum information. The appointment time will be checked again before it is saved.", firstNameLabel: "First name", lastNameLabel: "Last name", ramqReadOnlyLabel: "Health insurance number", createPatientAndAppointment: "Create patient and appointment", creatingPatientAndAppointment: "Creating…" },
  es: { newPatientFormTitle: "Crear el expediente y la cita", newPatientFormDescription: "Introduzca la información mínima del paciente. El horario se validará de nuevo antes de guardarlo.", firstNameLabel: "Nombre", lastNameLabel: "Apellido", ramqReadOnlyLabel: "Número de seguro médico", createPatientAndAppointment: "Crear paciente y cita", creatingPatientAndAppointment: "Creando…" },
  vi: { newPatientFormTitle: "Tạo hồ sơ và lịch hẹn", newPatientFormDescription: "Nhập thông tin tối thiểu của bệnh nhân. Thời gian sẽ được kiểm tra lại trước khi lưu.", firstNameLabel: "Tên", lastNameLabel: "Họ", ramqReadOnlyLabel: "Số bảo hiểm y tế", createPatientAndAppointment: "Tạo bệnh nhân và lịch hẹn", creatingPatientAndAppointment: "Đang tạo…" },
  no: { newPatientFormTitle: "Opprett pasientjournal og time", newPatientFormDescription: "Oppgi pasientens minimumsopplysninger. Tidspunktet kontrolleres på nytt før lagring.", firstNameLabel: "Fornavn", lastNameLabel: "Etternavn", ramqReadOnlyLabel: "Helseforsikringsnummer", createPatientAndAppointment: "Opprett pasient og time", creatingPatientAndAppointment: "Oppretter…" },
  ja: { newPatientFormTitle: "患者記録と予約を作成", newPatientFormDescription: "患者の最小限の情報を入力してください。保存前に時間枠を再確認します。", firstNameLabel: "名", lastNameLabel: "姓", ramqReadOnlyLabel: "医療保険番号", createPatientAndAppointment: "患者と予約を作成", creatingPatientAndAppointment: "作成中…" },
  zh: { newPatientFormTitle: "创建患者记录和预约", newPatientFormDescription: "请输入患者的基本信息。保存前将再次验证预约时间。", firstNameLabel: "名", lastNameLabel: "姓", ramqReadOnlyLabel: "医疗保险号码", createPatientAndAppointment: "创建患者和预约", creatingPatientAndAppointment: "正在创建…" },
  he: { newPatientFormTitle: "יצירת תיק מטופל ותור", newPatientFormDescription: "הזן את פרטי המינימום של המטופל. מועד התור ייבדק שוב לפני השמירה.", firstNameLabel: "שם פרטי", lastNameLabel: "שם משפחה", ramqReadOnlyLabel: "מספר ביטוח בריאות", createPatientAndAppointment: "יצירת מטופל ותור", creatingPatientAndAppointment: "יוצר…" },
  ko: { newPatientFormTitle: "환자 기록 및 예약 만들기", newPatientFormDescription: "환자의 최소 정보를 입력하세요. 저장하기 전에 예약 시간이 다시 확인됩니다.", firstNameLabel: "이름", lastNameLabel: "성", ramqReadOnlyLabel: "건강보험 번호", createPatientAndAppointment: "환자 및 예약 만들기", creatingPatientAndAppointment: "생성 중…" },
};

export function receptionLabel(locale: string, key: string, french: string) {
    const language = locale.toLowerCase().split("-")[0];
    return translations[language]?.[key] || availabilityTranslations[language]?.[key] || confirmationTranslations[language]?.[key] || newPatientFormTranslations[language]?.[key] || french;
}

export function isReceptionLabel(value: string, key: string, french: string) {
    return value === french || Object.values(translations).some(
        (localeLabels) => localeLabels[key] === value
    );
}
