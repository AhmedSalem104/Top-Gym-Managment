const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const writeJson = (relativePath, value) => {
    fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const exercises = readJson('data/library/exercises.json');
const muscles = readJson('data/library/muscles.json');
const exerciseAssetManifest = readJson('public/data/exercise-assets.json');
const exerciseAssetRecords = Array.isArray(exerciseAssetManifest?.records) ? exerciseAssetManifest.records : [];
let baselineExercises = [];
try {
    baselineExercises = JSON.parse(execFileSync('git', ['show', 'HEAD:data/library/exercises.json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (_) {
    baselineExercises = [];
}
const baselineBySourceId = new Map(baselineExercises.map((item) => [String(item.sourceId), item]));
const muscleById = new Map(muscles.map((muscle, index) => [index + 1, muscle]));
const muscleIdByName = new Map(muscles.map((muscle, index) => [muscle.name.toLowerCase(), index + 1]));
const assetBySourceId = new Map(exerciseAssetRecords.map((item) => [String(item.catalogSourceId), item]));
const sourceMuscleAliases = new Map([
    ['abdominals', 'abs']
]);

const arabicTokens = {
    'ab': 'بطن', 'abs': 'بطن', 'abdominal': 'بطن', 'abdominals': 'بطن', 'ankle': 'كاحل',
    'alternate': 'متبادل', 'alternating': 'متبادل', 'arm': 'ذراع', 'arms': 'ذراعان',
    'assisted': 'بمساعدة', 'back': 'ظهر', 'barbell': 'بار', 'band': 'شريط مقاومة', 'bands': 'أشرطة مقاومة',
    'behind': 'خلف', 'bench': 'بنش', 'bent': 'منحنٍ', 'biceps': 'باي', 'body': 'وزن الجسم',
    'box': 'صندوق', 'cable': 'كابل', 'calf': 'سمانة', 'calves': 'سمانة', 'carry': 'حمل',
    'chair': 'كرسي', 'chest': 'صدر', 'chin': 'ذقن', 'circle': 'دوائر', 'circles': 'دوائر',
    'close': 'قبضة ضيقة', 'crossover': 'متقاطع', 'crunch': 'كرنش', 'curl': 'كيرل', 'curls': 'كيرل',
    'decline': 'مائل لأسفل', 'deficit': 'مدى منخفض', 'deadlift': 'ديدليفت', 'deltoid': 'كتف',
    'dip': 'متوازي', 'dips': 'متوازي', 'dumbbell': 'دمبل', 'elevated': 'مرتفع', 'extension': 'تمديد',
    'external': 'خارجي', 'face': 'وجه', 'feet': 'قدمين', 'finger': 'أصابع', 'flat': 'مستوٍ',
    'fly': 'تفتيح', 'flye': 'تفتيح', 'flyes': 'تفتيح', 'front': 'أمامي', 'full': 'كامل',
    'glute': 'ألوية', 'glutes': 'ألوية', 'grip': 'قبضة', 'hamstring': 'فخذ خلفي', 'hamstrings': 'فخذ خلفي',
    'handstand': 'وقوف على اليدين', 'high': 'علوي', 'hip': 'ورك', 'incline': 'مائل لأعلى',
    'inner': 'داخلي', 'intermediate': 'متوسط', 'internal': 'داخلي', 'isometric': 'ثابت',
    'jump': 'قفز', 'kettlebell': 'كتل بيل', 'knee': 'ركبة', 'knees': 'الركبتين', 'lat': 'مجنص',
    'lateral': 'جانبي', 'leg': 'رجل', 'legs': 'رجلان', 'lift': 'رفع', 'lying': 'استلقاء',
    'machine': 'جهاز', 'medium': 'متوسطة', 'military': 'عسكري', 'narrow': 'ضيق', 'neck': 'رقبة',
    'one': 'ذراع واحدة', 'overhead': 'فوق الرأس', 'palms': 'راحة اليد', 'parallel': 'متوازي',
    'partial': 'جزئي', 'plank': 'بلانك', 'plate': 'قرص', 'press': 'ضغط', 'prone': 'منبطح',
    'pull': 'سحب', 'pulldown': 'سحب لأسفل', 'pullup': 'عقلة', 'pullups': 'عقلة', 'push': 'دفع',
    'pushup': 'ضغط', 'pushups': 'ضغط', 'raise': 'رفع', 'raises': 'رفع', 'rear': 'خلفي',
    'reverse': 'عكسي', 'romanian': 'روماني', 'row': 'تجديف', 'rows': 'تجديف', 'rotation': 'دوران',
    'seated': 'جالس', 'shoulder': 'كتف', 'side': 'جانبي', 'single': 'ذراع واحدة', 'sit': 'جلوس',
    'squat': 'سكوات', 'standing': 'واقف', 'step': 'خطوة', 'stretch': 'إطالة', 'supine': 'مستلقي على الظهر',
    'supported': 'مدعوم', 'swing': 'مرجحة', 't-bar': 'بار T', 'thrust': 'دفع الورك', 'toe': 'أصابع القدم',
    'triceps': 'تراي', 'tricep': 'تراي', 'upright': 'قائم', 'v-up': 'في أب', 'vertical': 'رأسي',
    'walking': 'متحرك', 'wall': 'حائط', 'weighted': 'بوزن', 'wide': 'واسع', 'wrist': 'رسغ',
    'yoga': 'يوجا', 'zercher': 'زيرشر', '90': '٩٠', '3': '٣/٤'
};

const equipmentArabic = {
    'body only': 'وزن الجسم', 'bodyweight': 'وزن الجسم', 'machine': 'الجهاز', 'barbell': 'البار',
    'dumbbell': 'الدمبل', 'cable': 'الكابل', 'kettlebell': 'الكتل بيل', 'bands': 'أشرطة المقاومة',
    'band': 'شريط المقاومة', 'plate': 'القرص', 'exercise ball': 'كرة التمرين', 'foam roll': 'رول الفوم'
};

const categoryArabic = { strength: 'القوة', stretching: 'الإطالة', cardio: 'الكارديو', plyometrics: 'القدرة الانفجارية', strongman: 'القوة الوظيفية', powerlifting: 'الباور لفتينج', olympic: 'الأولمبي', sports: 'الرياضة' };
const difficultyArabic = { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم' };

function normalize(value) {
    return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function idForMuscle(patterns) {
    const found = muscles.find((muscle) => patterns.some((pattern) => pattern.test(muscle.name)));
    if (!found) return null;
    return muscleIdByName.get(found.name.toLowerCase()) || null;
}

function sourceMuscleId(value) {
    const normalized = normalize(value);
    const aliased = sourceMuscleAliases.get(normalized) || normalized;
    return muscleIdByName.get(aliased) || null;
}

function sourceAssetFor(item) {
    return assetBySourceId.get(String(item.sourceId))
        || exerciseAssetRecords.find((record) => record.upstreamId && record.upstreamId === item.upstreamId)
        || null;
}

function inferTargetMuscleId(item) {
    const asset = sourceAssetFor(item);
    const sourcePrimary = (asset?.primaryMuscles || [])
        .map(sourceMuscleId)
        .find((id) => id && muscleById.has(id));
    if (sourcePrimary) return sourcePrimary;
    if (item.targetMuscleId && muscleById.has(Number(item.targetMuscleId))) return Number(item.targetMuscleId);
    const name = normalize(item.name);
    const rules = [
        [/neck|cervical/i, [/^Neck$/i]],
        [/tibialis|ankle|foot|toe/i, [/Tibialis Anterior/i, /Foot Intrinsics/i]],
        [/calf|gastrocnemius|soleus/i, [/^Calves$/i]],
        [/abduction|abductor/i, [/^Abductors$/i]],
        [/adduction|adductor/i, [/^Adductors$/i]],
        [/glute|hip thrust|bridge|kickback|donkey kick|fire hydrant/i, [/^Glutes$/i]],
        [/hamstring|nordic|leg curl|deadlift|romanian|good morning|hinge/i, [/^Hamstrings$/i]],
        [/squat|lunge|leg extension|step up|step-up|quad/i, [/^Quadriceps$/i]],
        [/\bab\b|roller|crunch|sit up|sit-up|plank|v up|hollow|dragon flag|toes to bar|l.?sit|mcgill|windmill|twist|side bend|dead bug|hanging leg|hanging pike|leg pull|figure 8|pass between|landmine 180|medicine ball full|slam|elbow to knee|cocoon|bottoms up|butt.?ups|scissor kick|leg tuck|spell caster|spider crawl|cable lift|wood chop|stomach vacuum|fallout|torso rotation|air bike|heel toucher|hip raise|judo flip|pull.?in|otis.?up|jackknife/i, [/^Abs$/i]],
        [/overhead stretch/i, [/^Shoulders$/i]],
        [/wind sprint/i, [/^Quadriceps$/i]],
        [/tricep|triceps|skullcrusher|pushdown|french press/i, [/^Triceps$/i]],
        [/bicep|biceps|curl|hammer/i, [/^Biceps$/i]],
        [/wrist|forearm|finger|grip|pronation|supination/i, [/^Forearms$/i]],
        [/shrug|trap/i, [/^Traps$/i]],
        [/rear delt|reverse fly|face pull/i, [/Rear Deltoid/i]],
        [/shoulder|deltoid|lateral raise|overhead press|military press|arnold press|z press|viking press/i, [/^Shoulders$/i]],
        [/chest|bench|push.?up|press|fly|dip/i, [/^Chest$/i]],
        [/row|pulldown|pull.?up|chin.?up|lat|back/i, [/^Back$/i]],
        [/back extension|lower back|hyperextension/i, [/Lower Back/i]]
    ];
    for (const [pattern, musclePatterns] of rules) {
        if (pattern.test(name)) {
            const id = idForMuscle(musclePatterns);
            if (id) return id;
        }
    }
    return null;
}

function translateName(name) {
    const raw = String(name || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const words = raw.split(/\s+/).map((word) => {
        const clean = word.toLowerCase().replace(/[(),]/g, '');
        if (arabicTokens[clean]) return arabicTokens[clean];
        if (/^\d+\/\d+$/.test(clean)) return clean.replace('3/4', '٣/٤').replace('90/90', '٩٠/٩٠');
        return word;
    });
    return `تمرين ${words.join(' ')}`.replace(/تمرين تمرين/g, 'تمرين').trim();
}

function familyFor(item) {
    const name = normalize(item.name);
    if (/neck|cervical/i.test(name)) return 'neck';
    if (/stretch|mobility|circle|rotation|flexion|extension/i.test(name) && !/tricep|bicep|leg extension|back extension/i.test(name)) return 'mobility';
    if (/crunch|sit up|sit-up|plank|v up|hollow|dragon flag|toes to bar|l.?sit|mcgill/i.test(name)) return 'core';
    if (/curl|bicep|hammer|preacher/i.test(name)) return 'curl';
    if (/row|pulldown|pull.?up|chin.?up|lat/i.test(name)) return 'pull';
    if (/deadlift|hinge|good morning|back extension|hyperextension/i.test(name)) return 'hinge';
    if (/squat|lunge|leg press|leg extension|leg curl|step.?up|calf|tibialis/i.test(name)) return 'lower';
    if (/press|push|bench|fly|chest|dip|pushdown|tricep/i.test(name)) return 'push';
    if (/raise|shrug|shoulder|deltoid|scaption|y raise|t raise|w raise/i.test(name)) return 'isolation';
    return item.category === 'stretching' ? 'mobility' : 'general';
}

function familyDetails(family) {
    return {
        push: { movement: 'الدفع', movementEn: 'a controlled press', cue: 'ثبّت الجذع ووجّه القوة عبر المرفقين', cueEn: 'keep the trunk stable and drive through the elbows' },
        pull: { movement: 'السحب', movementEn: 'a controlled pull', cue: 'ابدأ الحركة بالمرفقين وتجنّب رفع الكتفين', cueEn: 'initiate with the elbows and avoid shrugging' },
        lower: { movement: 'حركة الرجلين', movementEn: 'a lower-body pattern', cue: 'حافظ على اتجاه الركبة مع اتجاه القدم', cueEn: 'keep the knees tracking with the feet' },
        hinge: { movement: 'مفصل الورك', movementEn: 'a hip-hinge pattern', cue: 'ادفع الورك للخلف وحافظ على الظهر محايدًا', cueEn: 'push the hips back and keep a neutral spine' },
        core: { movement: 'تثبيت الجذع', movementEn: 'a trunk-control pattern', cue: 'ثبّت القفص الصدري وتجنّب استخدام الزخم', cueEn: 'brace the ribcage and avoid momentum' },
        curl: { movement: 'ثني الذراع', movementEn: 'an elbow-flexion pattern', cue: 'ثبّت المرفق قريبًا من الجسم واعصر العضلة في النهاية', cueEn: 'keep the elbow steady and squeeze at the top' },
        isolation: { movement: 'عزل العضلة المستهدفة', movementEn: 'an isolation pattern', cue: 'استخدم وزنًا يسمح بمدى كامل وتحكم مستمر', cueEn: 'use a load that allows a full, controlled range' },
        mobility: { movement: 'الحركة والإطالة', movementEn: 'a mobility pattern', cue: 'تحرك داخل مدى مريح وتوقف قبل الألم', cueEn: 'move through a comfortable range and stop before pain' },
        neck: { movement: 'حركة الرقبة', movementEn: 'a neck-control pattern', cue: 'نفّذ الحركة ببطء شديد وبدون ضغط أو ألم', cueEn: 'move very slowly without forcing the neck' },
        general: { movement: 'الحركة الأساسية', movementEn: 'the listed movement pattern', cue: 'حافظ على وضعية ثابتة وتحكم في كل تكرار', cueEn: 'keep a stable position and control every repetition' }
    }[family];
}

function sourceFirstCue(item) {
    const instructions = Array.isArray(item.instructions)
        ? item.instructions.filter((step) => typeof step === 'string' && step.trim())
        : [];
    const first = String(instructions[0] || '').replace(/\s+/g, ' ').trim();
    if (!first) return '';
    const sentence = first.split(/(?<=[.!?])\s+/u)[0].trim();
    return (sentence.length > 180 ? `${sentence.slice(0, 177).trim()}…` : sentence);
}

function exerciseVariantGuidance(item, family) {
    const name = normalize(item.name);
    if (/fly|flye/.test(name)) {
        return {
            tipEn: 'Keep a soft elbow bend and move through a controlled arc instead of turning the fly into a press.',
            tipAr: 'حافظ على ثني خفيف في المرفق وحرك الذراعين في قوس متحكم بدل تحويل التفتيح إلى ضغط.',
            mistakeEn: 'Straightening the elbows or shortening the arc, which increases joint stress and changes the purpose of the fly.',
            mistakeAr: 'فرد المرفقين أو تقصير القوس، مما يزيد الضغط على المفصل ويغير هدف التفتيح.'
        };
    }
    if (/row/.test(name)) {
        return {
            tipEn: 'Pull toward the intended line of the row and pause when the shoulder blades finish moving, not when the hands simply reach the body.',
            tipAr: 'اسحب في مسار التجديف الصحيح وتوقف عند اكتمال حركة لوحي الكتف، وليس بمجرد وصول اليدين للجسم.',
            mistakeEn: 'Shrugging or rotating the torso to finish the row instead of keeping the chest and shoulders controlled.',
            mistakeAr: 'رفع الكتفين أو لف الجذع لإنهاء التجديف بدل الحفاظ على تحكم الصدر والكتفين.'
        };
    }
    if (/pull.?up|chin.?up|pulldown|lat/.test(name)) {
        return {
            tipEn: 'Start the pull by setting the shoulders down, then drive the elbows toward the ribs while keeping the torso quiet.',
            tipAr: 'ابدأ السحب بخفض الكتفين ثم وجه المرفقين نحو الأضلاع مع تثبيت الجذع.',
            mistakeEn: 'Kipping, swinging, or pulling only with the forearms before the back and elbows have initiated the movement.',
            mistakeAr: 'استخدام التأرجح أو دفع الجسم أو السحب بالساعدين قبل بدء الحركة من الظهر والمرفقين.'
        };
    }
    if (/deadlift|hinge|good morning|back extension|hyperextension/.test(name)) {
        return {
            tipEn: 'Keep the load close to the body and finish by extending the hips without leaning back or overextending the spine.',
            tipAr: 'حافظ على الوزن قريبًا من الجسم وأنهِ الحركة بمد الورك دون الميل للخلف أو المبالغة في مد الظهر.',
            mistakeEn: 'Rounding the lower back or bending the knees into a squat instead of maintaining a controlled hip hinge.',
            mistakeAr: 'تقويس أسفل الظهر أو تحويل الحركة إلى سكوات بدل الحفاظ على مفصل الورك المتحكم.'
        };
    }
    if (/squat|lunge|leg press|step.?up|split squat/.test(name)) {
        return {
            tipEn: 'Keep the whole foot connected to the floor and let the knees follow the same direction as the toes through the full range.',
            tipAr: 'ثبت القدم كاملة على الأرض ودع الركبتين تتحركان في اتجاه أصابع القدم خلال المدى المتاح.',
            mistakeEn: 'Allowing the knees to collapse inward, lifting the heels, or cutting the range to use more load than you can control.',
            mistakeAr: 'دخول الركبتين للداخل أو رفع الكعبين أو تقليل المدى لاستخدام وزن أكبر من قدرتك على التحكم.'
        };
    }
    if (/curl|preacher|hammer/.test(name)) {
        return {
            tipEn: 'Keep the elbows quiet and lower the weight slowly until the arm is lengthened without losing shoulder position.',
            tipAr: 'ثبت المرفقين وأنزل الوزن ببطء حتى تطول العضلة دون فقدان وضع الكتف.',
            mistakeEn: 'Swinging the torso or rolling the shoulders forward to start the curl instead of loading the elbow flexors.',
            mistakeAr: 'تحريك الجذع أو تدوير الكتفين للأمام لبدء الكيرل بدل تحميل عضلات ثني المرفق.'
        };
    }
    if (/raise|shrug|scaption|y raise|t raise|w raise/.test(name)) {
        return {
            tipEn: 'Use a light enough load to keep the shoulders away from the ears and stop at the range you can control.',
            tipAr: 'استخدم وزنًا يسمح بإبعاد الكتفين عن الأذنين وتوقف عند المدى الذي تستطيع التحكم فيه.',
            mistakeEn: 'Shrugging, swinging, or lifting beyond a comfortable shoulder range to make the repetition look larger.',
            mistakeAr: 'رفع الكتفين أو التأرجح أو تجاوز المدى المريح للكتف من أجل إكمال تكرار أكبر شكليًا.'
        };
    }
    if (/plank|crunch|sit.?up|v.?up|hollow|dragon flag|toes to bar|twist|rotation|wood chop/.test(name) || family === 'core') {
        return {
            tipEn: 'Brace the ribs and pelvis together, then move only through the range that keeps the trunk under control.',
            tipAr: 'ثبت القفص الصدري والحوض معًا ثم تحرك فقط داخل المدى الذي يحافظ على تحكم الجذع.',
            mistakeEn: 'Pulling with the neck, arching the lower back, or using speed to finish a core repetition.',
            mistakeAr: 'السحب بالرقبة أو تقويس أسفل الظهر أو استخدام السرعة لإنهاء تكرار البطن.'
        };
    }
    if (/stretch|mobility|rotation|flexion|extension/.test(name) && family === 'mobility') {
        return {
            tipEn: 'Breathe normally and move gradually into the stretch; stop before sharp pain or forced end range.',
            tipAr: 'تنفس طبيعيًا وادخل في الإطالة تدريجيًا وتوقف قبل الألم الحاد أو الوصول القسري لنهاية المدى.',
            mistakeEn: 'Bouncing, forcing the joint, or holding the breath while trying to gain range too quickly.',
            mistakeAr: 'الارتداد أو الضغط على المفصل أو حبس النفس أثناء محاولة زيادة المدى بسرعة.'
        };
    }
    if (/jump|plyometric|sprint|treadmill|running|cycling|bike|rowing/.test(name) || item.category === 'cardio' || item.category === 'plyometrics') {
        return {
            tipEn: 'Build the pace or height progressively and keep the landing or foot strike quiet before increasing intensity.',
            tipAr: 'زد السرعة أو الارتفاع تدريجيًا وحافظ على هبوط أو ملامسة هادئة قبل زيادة الشدة.',
            mistakeEn: 'Starting at maximum intensity, losing posture, or ignoring a noisy landing and continuing through fatigue.',
            mistakeAr: 'البدء بأقصى شدة أو فقدان الوضعية أو تجاهل الهبوط العنيف والاستمرار رغم التعب.'
        };
    }
    if (family === 'neck') {
        return {
            tipEn: 'Keep the movement small and slow, using no external load and stopping well before discomfort.',
            tipAr: 'اجعل الحركة صغيرة وبطيئة دون وزن خارجي وتوقف قبل ظهور عدم الراحة بوقت كافٍ.',
            mistakeEn: 'Forcing the neck into end range, moving quickly, or using resistance that the cervical spine cannot control.',
            mistakeAr: 'دفع الرقبة لنهاية المدى أو التحرك بسرعة أو استخدام مقاومة لا يستطيع العمود العنقي التحكم بها.'
        };
    }
    const familyGuidance = {
        push: {
            tipEn: `Keep the wrists stacked over the elbows in ${item.name} and finish each repetition without locking out aggressively.`,
            tipAr: `حافظ على اصطفاف الرسغ فوق المرفق في ${item.name} وأنهِ التكرار دون قفل عنيف للمفصل.`,
            mistakeEn: `Letting the wrists bend back or the shoulders roll forward during ${item.name}, especially as fatigue builds.`,
            mistakeAr: `ثني الرسغين للخلف أو تدوير الكتفين للأمام أثناء ${item.name}، خصوصًا مع ظهور التعب.`
        },
        pull: {
            tipEn: `Keep the chest open during ${item.name} and finish the pull with the back rather than squeezing the handle harder.`,
            tipAr: `حافظ على انفتاح الصدر أثناء ${item.name} وأنهِ السحب بالظهر بدل زيادة الضغط على المقبض.`,
            mistakeEn: `Starting ${item.name} by lifting the shoulders or bending the wrists, which reduces back involvement.`,
            mistakeAr: `بدء ${item.name} برفع الكتفين أو ثني الرسغين، مما يقلل مشاركة عضلات الظهر.`
        },
        lower: {
            tipEn: `Control the lowering phase of ${item.name} and keep pressure distributed across the foot before driving up.`,
            tipAr: `تحكم في مرحلة النزول من ${item.name} ووزع الضغط على القدم قبل الدفع لأعلى.`,
            mistakeEn: `Dropping quickly into ${item.name} and rebounding from the bottom before the hips and knees are prepared.`,
            mistakeAr: `النزول بسرعة في ${item.name} والارتداد من الأسفل قبل تجهيز الورك والركبتين.`
        },
        hinge: {
            tipEn: `Keep the spine long throughout ${item.name} and finish tall through the hips rather than lifting the ribs.`,
            tipAr: `حافظ على طول العمود الفقري طوال ${item.name} وأنهِ الحركة بمد الورك بدل رفع الأضلاع.`,
            mistakeEn: `Pulling from the lower back in ${item.name} or finishing by leaning backward instead of extending the hips.`,
            mistakeAr: `السحب من أسفل الظهر في ${item.name} أو الميل للخلف في النهاية بدل مد الورك.`
        },
        core: {
            tipEn: `Keep the ribs down and exhale through the hardest part of ${item.name} to maintain trunk pressure.`,
            tipAr: `اخفض الأضلاع وأخرج النفس خلال أصعب جزء من ${item.name} للحفاظ على ضغط الجذع.`,
            mistakeEn: `Letting the ribs flare or the pelvis tip away from control during ${item.name} as the set becomes difficult.`,
            mistakeAr: `رفع الأضلاع أو فقدان وضع الحوض أثناء ${item.name} مع زيادة صعوبة المجموعة.`
        },
        curl: {
            tipEn: `Use the full comfortable elbow range in ${item.name} and keep the shoulder from taking over the lift.`,
            tipAr: `استخدم المدى المريح الكامل للمرفق في ${item.name} ولا تسمح للكتف بالسيطرة على الرفع.`,
            mistakeEn: `Shortening ${item.name} or resting the weight on the joints instead of keeping tension through the arm.`,
            mistakeAr: `تقليل مدى ${item.name} أو إراحة الوزن على المفاصل بدل الحفاظ على الشد في الذراع.`
        },
        isolation: {
            tipEn: `Choose precision over load in ${item.name}; keep the path consistent from the first repetition to the last.`,
            tipAr: `اختر الدقة بدل الوزن في ${item.name} وحافظ على نفس المسار من أول تكرار لآخره.`,
            mistakeEn: `Using a heavy load in ${item.name} that forces momentum and makes another joint perform the movement.`,
            mistakeAr: `استخدام وزن ثقيل في ${item.name} يفرض الزخم ويجعل مفصلًا آخر ينفذ الحركة.`
        },
        mobility: {
            tipEn: `Stay inside a smooth, pain-free range in ${item.name} and return slowly before repeating the motion.`,
            tipAr: `ابق داخل مدى سلس وخالٍ من الألم في ${item.name} وعُد ببطء قبل تكرار الحركة.`,
            mistakeEn: `Chasing a deeper position in ${item.name} by sacrificing breathing, alignment, or joint comfort.`,
            mistakeAr: `السعي لمدى أعمق في ${item.name} على حساب التنفس أو المحاذاة أو راحة المفصل.`
        },
        neck: {
            tipEn: `Keep the head supported and the range conservative in ${item.name}; quality matters more than distance.`,
            tipAr: `حافظ على دعم الرأس ومدى محافظ في ${item.name}؛ الجودة أهم من المسافة.`,
            mistakeEn: `Using speed or external pressure in ${item.name} when the neck cannot maintain a relaxed, controlled position.`,
            mistakeAr: `استخدام السرعة أو ضغط خارجي في ${item.name} عندما لا تستطيع الرقبة الحفاظ على وضع متحكم ومسترخٍ.`
        }
    };
    return familyGuidance[family] || {
        tipEn: `Use a steady tempo for ${item.name} and stop the set when alignment starts to change.`,
        tipAr: `نفذ ${item.name} بإيقاع ثابت وأوقف المجموعة عندما تبدأ المحاذاة في التغير.`,
        mistakeEn: `Changing the setup of ${item.name} midway through the set, which shifts the load away from the intended target.`,
        mistakeAr: `تغيير وضعية ${item.name} أثناء المجموعة، مما ينقل الحمل بعيدًا عن العضلة المستهدفة.`
    };
}

function muscleLabel(id, english = false) {
    const muscle = muscleById.get(Number(id));
    return muscle ? (english ? muscle.name : muscle.nameAr || muscle.name) : (english ? 'the target muscle' : 'العضلة المستهدفة');
}

function equipmentLabel(item) {
    const raw = String(item.equipment || 'body only').trim();
    return equipmentArabic[raw.toLowerCase()] || raw;
}

function normalizeSecondary(item, asset) {
    const sourceEntries = Array.isArray(asset?.secondaryMuscles) && asset.secondaryMuscles.length
        ? asset.secondaryMuscles.map((name) => ({ sourceName: name, muscleId: sourceMuscleId(name) }))
        : (Array.isArray(item.secondaryMuscles) ? item.secondaryMuscles.map((entry) => ({
            sourceName: null,
            muscleId: Number(entry && typeof entry === 'object' ? entry.muscleId : entry)
        })) : []);
    const existingById = new Map((Array.isArray(item.secondaryMuscles) ? item.secondaryMuscles : []).map((entry) => {
        const muscleId = Number(entry && typeof entry === 'object' ? entry.muscleId : entry);
        return [muscleId, entry];
    }));
    return Array.from(new Map(sourceEntries.map((entry) => {
        const muscleId = Number(entry.muscleId);
        const existing = existingById.get(muscleId);
        const percent = Number(existing?.contributionPercent);
        return [muscleId, {
            muscleId,
            contributionPercent: Number.isFinite(percent) && percent > 0 ? percent : null,
            role: 'secondary'
        }];
    }).filter(([muscleId]) => muscleById.has(muscleId))).values());
}

function enrich(item) {
    const baseline = baselineBySourceId.get(String(item.sourceId));
    const hasEnrichedBaseline = Boolean(baseline?.contentQuality);
    const targetWasMissing = hasEnrichedBaseline
        ? item.contentQuality?.targetMuscleInferred === true
        : !baseline?.targetMuscleId;
    const equipmentWasMissing = hasEnrichedBaseline
        ? item.contentQuality?.equipmentInferred === true
        : !baseline?.equipment;
    const difficultyWasMissing = hasEnrichedBaseline
        ? item.contentQuality?.difficultyInferred === true
        : !baseline?.difficulty;
    const targetMuscleId = inferTargetMuscleId(item);
    const asset = sourceAssetFor(item);
    const family = familyFor(item);
    const detail = familyDetails(family);
    const targetAr = muscleLabel(targetMuscleId, false);
    const targetEn = muscleLabel(targetMuscleId, true);
    const nameAr = item.nameAr || translateName(item.name);
    const category = String(item.category || 'strength').toLowerCase();
    const difficulty = String(item.difficulty || 'intermediate').toLowerCase();
    const equipment = item.equipment || 'body only';
    const equipmentEn = equipment.toLowerCase() === 'body only' ? 'bodyweight' : equipment;
    const equipmentAr = equipmentLabel({ ...item, equipment });
    const secondaryMuscles = normalizeSecondary(item, asset);
    const targetMuscleFromSource = (asset?.primaryMuscles || []).some((name) => sourceMuscleId(name) === targetMuscleId);
    const nameArCore = nameAr.replace(/^تمرين\s+/u, '').trim();
    const secondaryEn = secondaryMuscles.map((entry) => muscleLabel(entry.muscleId, true)).join(', ') || 'the supporting muscles listed by the source';
    const secondaryAr = secondaryMuscles.map((entry) => muscleLabel(entry.muscleId, false)).join('، ') || 'العضلات المساعدة المذكورة في المصدر';
    const sourceInstructions = Array.isArray(item.instructions)
        ? item.instructions.filter((step) => typeof step === 'string' && step.trim())
        : [];
    const sourceCue = sourceFirstCue(item);
    const variant = exerciseVariantGuidance(item, family);
    const variantTipEn = `${variant.tipEn} Apply this cue specifically to ${item.name}.`;
    const variantTipAr = `${variant.tipAr} طبّق هذه الملاحظة على ${nameAr}.`;
    const variantMistakeEn = `${variant.mistakeEn} Correct it in ${item.name} before adding load or intensity.`;
    const variantMistakeAr = `${variant.mistakeAr} صحح ذلك في ${nameAr} قبل زيادة الوزن أو الشدة.`;

    const description = `${item.name} is a ${difficulty} ${category} movement performed with ${equipmentEn}. It primarily targets ${targetEn} and uses ${detail.movementEn}; the listed source steps should be followed with a controlled range and steady breathing. Supporting muscles include ${secondaryEn}.`;
    const descriptionAr = `${nameAr} من تمارين ${categoryArabic[category] || category}، ويُنفَّذ باستخدام ${equipmentAr}. يستهدف أساسًا ${targetAr} مع نمط ${detail.movement}، ويُفضّل تطبيق خطوات المصدر بمدى متحكم وتنفس منتظم. وتشارك معه ${secondaryAr}.`;
    const tips = [
        `Keep ${targetEn} as the focus of ${item.name}; ${detail.cueEn}.`,
        sourceCue ? `Check the setup before the first repetition of ${item.name}: ${sourceCue}` : `Check the setup before the first repetition of ${item.name} and keep the starting position stable.`,
        variantTipEn
    ];
    const tipsAr = [
        `اجعل ${targetAr} محور ${nameAr}؛ ${detail.cue}.`,
        `قبل أول تكرار من ${nameAr} راجع وضعية البداية وتأكد من ثباتها.`,
        variantTipAr
    ];
    const commonMistakes = [
        variantMistakeEn,
        sourceCue ? `Rushing the setup for ${item.name} and ignoring the documented starting cue: ${sourceCue}` : `Rushing the setup for ${item.name} and losing the documented starting position.`,
        `Allowing the ${targetEn} to lose tension during ${item.name} when the load or range is beyond the level you can control.`
    ];
    const commonMistakesAr = [
        variantMistakeAr,
        `التسرع في بداية ${nameAr} وتجاهل الوضعية الموثقة للتمرين.`,
        `فقدان الشد في ${targetAr} أثناء ${nameAr} عندما يكون الوزن أو المدى أكبر من المستوى المتحكم فيه.`
    ];
    const instructionsAr = [
        `اضبط وضعية البداية لتمرين ${nameArCore} وجهّز ${equipmentAr} قبل بدء التكرار.`,
        `ثبّت ${targetAr} ونفّذ ${detail.movement} ببطء مع تطبيق الإشارة التالية: ${detail.cue}.`,
        `حافظ على التنفس المنتظم وتوقف عند نهاية المدى المريح دون ألم أو تعويض.`,
        `عُد إلى وضع البداية بتحكم، ثم كرّر الحركة مع الحفاظ على نفس الإيقاع.`
    ];
    const instructions = sourceInstructions.length > 0
        ? sourceInstructions
        : [
            `Set up for ${item.name} with ${equipmentEn} and choose a stable starting position.`,
            `Perform ${detail.movementEn} while keeping ${targetEn} as the primary focus and following the listed range.`,
            `Breathe steadily, pause before compensation appears, and stop at a pain-free end range.`,
            `Return to the starting position under control and repeat with the same technique.`
        ];
    const contentQuality = {
        version: 3,
        source: 'dataset-derived-with-exercise-specific-cues',
        targetMuscleInferred: !targetMuscleFromSource && targetWasMissing && Boolean(targetMuscleId),
        targetMuscleSource: targetMuscleFromSource ? 'exercise-assets-manifest' : null,
        secondaryMuscleSource: asset && Array.isArray(asset.secondaryMuscles) ? 'exercise-assets-manifest' : null,
        equipmentInferred: equipmentWasMissing,
        difficultyInferred: difficultyWasMissing,
        secondaryMuscleModel: secondaryMuscles.some((entry) => entry.contributionPercent == null) ? 'role-only' : 'percentage-and-role'
    };

    return {
        ...item,
        nameAr,
        description,
        descriptionAr,
        targetMuscleId: targetMuscleId || null,
        secondaryMuscles,
        equipment,
        difficulty,
        tips,
        tipsAr,
        commonMistakes,
        commonMistakesAr,
        instructions,
        instructionsAr,
        contentQuality,
        dataCompleteness: {
            hasSourceInstructions: Array.isArray(item.instructions) && item.instructions.length > 0,
            hasArabicInstructions: instructionsAr.length > 0,
            hasTargetMuscle: Boolean(targetMuscleId),
            secondaryCount: secondaryMuscles.length
        }
    };
}

const enriched = exercises.map(enrich);
writeJson('data/library/exercises.json', enriched);
writeJson('data/library/exercises-dataset.json', enriched);

const summary = {
    exercises: enriched.length,
    nameAr: enriched.filter((item) => item.nameAr).length,
    descriptions: enriched.filter((item) => item.description && item.descriptionAr).length,
    tips: enriched.filter((item) => item.tips?.length && item.tipsAr?.length).length,
    commonMistakes: enriched.filter((item) => item.commonMistakes?.length && item.commonMistakesAr?.length).length,
    instructionsAr: enriched.filter((item) => item.instructionsAr?.length).length,
    targetMuscles: enriched.filter((item) => item.targetMuscleId).length,
    inferredTargetMuscles: enriched.filter((item) => item.contentQuality.targetMuscleInferred).length,
    secondaryEntries: enriched.reduce((sum, item) => sum + item.secondaryMuscles.length, 0),
    percentageBackedSecondaryEntries: enriched.reduce((sum, item) => sum + item.secondaryMuscles.filter((entry) => entry.contributionPercent != null).length, 0),
    roleOnlySecondaryEntries: enriched.reduce((sum, item) => sum + item.secondaryMuscles.filter((entry) => entry.contributionPercent == null).length, 0),
    targetMuscleManualReview: enriched.filter((item) => !item.targetMuscleId).map((item) => ({ sourceId: item.sourceId, name: item.name }))
};
console.log(JSON.stringify(summary));
