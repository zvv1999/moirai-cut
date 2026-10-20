"""Create editorial usage-guide drafts from a reviewed library snapshot; never writes the service.

Run: python3 scripts/templates/draft-library-usage-guides.py /absolute/evidence/directory
The directory must contain dynamic-assets-snapshot.json and reviews-snapshot.json.
Guide prose is authored below. Definition facts and CAS revision references are taken
from the snapshot; this is not an automatic aesthetic score or runtime policy engine.
"""
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
catalog = json.loads((root / 'dynamic-assets-snapshot.json').read_text())
reviews = json.loads((root / 'reviews-snapshot.json').read_text())['reviews']
archived = {row['assetId'] for row in catalog['library'] if row.get('archived')}
assets = {a['id']: a for a in catalog['assets'] if a['id'] not in archived}
arrow_guide = json.loads((pathlib.Path(__file__).parent / 'seeds' / 'arrow.json').read_text())['usageGuide']
# One family is one candidate direction, never a qualified-template count.
families = [
('行动清单', 'style-study-20260929-checklist-headline', ['style-study-20260930-checklist-split-roles','style-study-20260930-checklist-sidebar-large','style-study-20260930-checklist-sidebar','style-study-20260929-checklist-headline','style-study-20260929-checklist'],
 '用于步骤、行动建议或完成事项；必须有明确可执行内容，不能把一般论述也标成任务。',
 '保留暖白清单纸、靛蓝标题条、奶油装订夹、三行绿底勾选与深蓝轮廓；图标逐项成形，不能将三行装饰冒充真实任务数量。',
 '可选择关键词花字或正文/重点分层应用，按画面空位调整整体大小与文字行宽；图标相对文字距离可在本次定制组合中调整。',
 '图标不能挡住正在讲述的实际物件，勾形及三条横线须能分辨；正文与侧栏重点不得同时争抢阅读。长步骤不适合压缩成细小侧栏。',
 '先扩大可阅读区域或换到下方/侧面，再缩短本次强调范围；完整正文须保留在独立字幕。仍不清楚时仅保留正文，不能伪称图标完成了信息表达。',
 '清单已有三种中文词长及实拍/负例实验；分层r1的80分是历史，r2未达90。侧栏曾出现小字、长句和语义分段问题。',
 ['checklist-headline-20260930','checklist-split-roles-20260930'], 'P1', '完善正文与关键词分层后的阅读层级、短事件和真正新背景；图标加花字不是另一款。'),
('灵感灯泡', 'style-study-20260929-bulb-headline', ['style-study-20260929-bulb-headline','style-study-20260929-bulb','style-study-20260928-idea'],
 '用于灵感、新认识、解决问题等语义；无匹配语义时不触发灯泡。',
 '保留暖黄光、深色轮廓、灯颈与灯座的完整识别形；灯泡花字保留奶油字与棕色描边，并依附文字边界。',
 '可按画面调整位置、整体比例与花字行宽；独立图标可与正文组合，不能把图标整体缩放误写成灯座或光芒逐层缩放。',
 '图标顶端光芒必须在画内；灯泡完整造型必须有稳定显示窗口。花字限制两行，1280×720的40px阅读预算已有局部测试，其他画幅重新测量。',
 '先换空位，再调宽度和整体大小；短事件采用较轻动效的定制组合或换无图标重点词。删除造型部件属于定制组合，不能静默覆盖库默认。',
 '灯泡花字r3指南已有，视觉来自r2；中文2/4/8字与少数英文实拍已测，正例主要紫色展板；未充分覆盖新背景、竖屏或连续观片听感。',
 ['bulb-cross-snappy-20260930','bulb-safe-margin-v2-20261007','bulb-headline-20260929'], 'P0', '冻结r3，在不同内容应用并保留Agent调参理由；新增真实背景，0.34秒短词不宣称充分可读。'),
('便签纸面', 'style-study-20260924-note', ['style-study-20260929-note-caption','style-study-20260929-note-paper','style-study-20260924-note'],
 '用于补充解释、阅读注释或温暖语气的重点；正文便签与关键词便签分开选择。',
 '保留深棕左对齐文字、暖纸底色、顶部胶带与柔和纸面层次；胶带跟随实际文字框，纸面/阴影/高光作为整体退场。',
 '可调整纸条宽度、整体比例及位置。长词依靠自然换行；原始纸签轻倾斜是身份特征，字幕版保持轻量上移。',
 '纸面与文字两侧留白必须保留；阴影与主文字采用一致换行和字形，胶带不能飘离纸边；不把纸条铺成人物面部遮罩。',
 '先换空位和行宽，再用较简洁便签变体；满句拥挤时转普通字幕。延长视觉停留只能在本次编排中表达，并受下一关键词约束。',
 'r8纸签已有三个输入13事件和多级依附修复证据；0.8秒停留是定制编排实验，不是默认保证。r7右上应用83分不继承；正文/黄纸是同族候选。',
 ['note-material-fixed-20260930','note-reading-hold-20260930','note-boundaries-20260930','note-paper-20260929'], 'P0', '核实新输入纸质层次、留白和短词阅读；不继续为每句改变默认纸条。'),
('增长柱形', 'style-study-20260929-growth-headline', ['style-study-20260929-growth-headline','style-study-20260929-bold-growth','style-study-20260928-growth'],
 '用于增长、积累、进步的定性提示；未绑定真实数据时不能作为数值图表或暗示准确比例。',
 '保持从左到右递增的三柱、统一基线及逐级升起；复古版保留红橙黄内层、奶油边和深色错位底。',
 '可调整整体尺寸、位置、花字行宽；选择圆底简图或复古柱形是同方向变体，不能随机打乱高低顺序。',
 '三柱完全展开后必须能辨认阶梯关系；文字上方图形依附随换行更新，不与讲解中的真实图表混淆。',
 '先找不干扰真实数据的空位，短事件减少动作幅度或换静态强调；若文案不是增长语义，则不放柱图。定制动作单独记录。',
 '花字r2已测三份中文语音与一个访谈画面，120ms入口给0.4秒事件更多停留；横竖构图实验仍有字幕手势遮挡/空区，不证明广泛适配。',
 ['growth-headline-timing-20260929','growth-headline-live-20260929','bold-growth-20260929'], 'P1', '补独立实拍正例与非增长负例；区别装饰统计图与真实数据图表。'),
('地球科普', 'style-study-20260929-globe', ['style-study-20260929-globe'],
 '用于地球、全球或空间观察的定性提示；它是经纬示意，不能替代地图、国界或科学比例模型。',
 '保持青蓝球面、深蓝外缘、暖白轮廓、展开经线及倾斜纬线；所有球体部件整体轻弹和独立事件退场。',
 '可整体移动和等比缩放，与说明文字或字幕组合；不要将某条经纬线独立拉长成不一致球面。',
 '小尺寸下经纬线须连续可辨，球体不能压到原片的太阳或地球示意；不得因为话题宽泛就遮住实际科学图示。',
 '先调整位置，再放大或移除装饰；若需要具体地理信息改用有来源地图，不用该图形伪装科学数据。',
 'r2在两种相近背景、三次真实事件上检查了经纬描边和退出；六层可编辑。尚未三种独立场景审美验收或试听。',
 ['globe-stroke-rule-20260929'], 'P1', '补地理/全球语义的真实输入；与普通圆圈在小屏上的辨识差异需实看。'),
('清晰字幕', 'style-pilot-20260923-caption', ['style-caption-inline-soft-panel-candidate-20260929','style-caption-inline-fine-candidate-20260929','style-caption-inline-cyan-candidate-20260929','style-caption-compact-candidate-20260929','style-pilot-20260923-caption'],
 '用于完整口播正文；逐词跟读和句内重点是不同高亮策略，由声音词时间及语义标注驱动。',
 '保持白色正文与深描边的阅读对比、最多两行、稳定显示；逐词版本保留黄色活动词，句内重点版本保留青色语义重点。',
 '可调整字幕行宽、整体大小和位置，按背景选择细描边或轻底板；高亮语义和活动词不能混称。',
 '全文与原词时间一致，不为漂亮换行漏词或伪造词时长；底字幕须检查手势和已有字幕，字号预算按实际输出尺寸评估。',
 '先调整字幕显示单元及行宽，再选择有底板版本或独立阅读区；语速太快时保留清晰稳定正文，减少装饰动作。',
 '主字幕r3有三实拍97词验证，去掉影响短词的全句渐变；紧凑/青色/底板为候选变体，不是五款。全文多语言、小屏和新背景仍待完整验收。',
 ['caption-natural-real-20260929'], 'P0', '优先保证字幕完整、活动词时机与跨背景可读；句内重点需有语义证据。'),
('时间时钟', 'style-study-20260929-clock', ['style-clock-detail-candidate-20260929','style-study-20260929-clock'],
 '用于时间、等待、期限或节奏提示；指针运动是装饰，不代表真实时刻或倒计时。',
 '保持蓝灰表框、暖白表盘、共同轴心与长短指针的对应关系；指针转动过程中端点和轴心不能脱离。',
 '可调整整体位置和尺寸；精细刻度为同族高细节候选，必须根据实际像素选择。',
 '刻度及指针在目标大小可分辨；不得把装饰转角当作准确计时。需检查短事件首次成形、稳定指针和退出残留。',
 '缩小时优先选简洁钟面，仍不可辨就移除图标或换文字时间提示；不要靠模糊小圆盘占位。',
 '主时钟r3已修复事件组独立退场并有三图标复测；精细刻度r1不能继承主时钟证据。未有当前90分应用。',
 [], 'P1', '精细刻度与简图在移动端的实际辨识测试、时间语义负例和短事件。'),
('完成勾选', 'style-study-20260929-completion', ['style-study-20260929-completion'],
 '用于已完成、确认、通过的正向反馈；建议尚未执行或存在否定时不得显示已完成。',
 '保持勾选符号与圆形衬底的整体关系、勾形逐段成形和组同步消失；图形仅表示状态，不能替代内容。',
 '可调整位置、等比尺寸，与实际确认短语组合；保留短笔到长笔的方向和连续关系。',
 '完整勾形须有稳定展示；不覆盖选项文本或真实控件，不把多个任务合并成一次已完成宣告。',
 '短事件先简化成形动作的定制组合，仍无法辨识则用静态文本；语义不确定时不触发。',
 'r4有separateInstances修复与组退场三图标复测；技术发布及叶层编辑性不等于状态语义或审美通过。',
 [], 'P1', '确认/否定/待执行三类语义与快速连续确认事件，避免误导。'),
('青色强调', 'style-study-20260928-cyan-impact', ['style-cyan-accent-candidate-20260929','style-cyan-translucent-candidate-20260929','style-study-20260928-cyan-impact','live-cyan-caption-20260919'],
 '用于高能量重点词或口播情绪强调；不作为整段正文默认样式。',
 '保留高饱和青色粗字、深轮廓及快速缩放回弹；双笔触/深底板属于同族备选，不按颜色或位置多计款数。',
 '可调整位置、行宽、整体比例，按背景选择带衬底版本；动作仍须先快速到达稳定造型。',
 '最多两行的候选须实测长词；实时参考条目只有一行且是literal绑定，不能当成已完成关键词模板。青字与太阳等明亮图示不能竞争。',
 '先避开干扰区域，再尝试深底板或更安静的强调模板；短词不能把大半生命周期用于入场。',
 'r2有84/86分两种精确应用，双笔触r1有86分；分数不是当前任意应用保证。保护区复测已有16事件，仍未完成听感与手机阅读验收。',
 ['cyan-protected-placement-20260930','cyan-natural-real-2026-09-29'], 'P0', '保留高能量身份同时处理复杂背景和极短词；历史参考条目不计新款。'),
('双圈强调', 'style-study-20260928-rings', ['style-study-20260928-rings'],
 '用于圈出明确画面对象或词块；必须知道被圈对象，不能随意放两个圆作为装饰。',
 '保留双圈的错位与手绘式强调感、前后轮廓层级；圈的中心服务于目标位置。',
 '可按当前对象整体平移和等比缩放，目标宽高不适合圆时换标记方式；目标是画面标注，坐标属于本次应用。',
 '圈不能遮住对象关键信息，所有运动时刻仍围绕目标；不假定当前定义自动跟踪移动目标。',
 '先换圈的大小与空隙，移动对象需有跟踪或关键帧证据；没有跟踪能力则换箭头/文字，不宣称自动跟随。',
 '原生四椭圆图层与动效定义可读；当前没有覆盖移动目标、复杂背景的有效90分应用。',
 [], 'P2', '建立与真实对象的关系及动作时刻验收，补移动目标限制。'),
('方向箭头', 'style-study-20260928-arrow', ['style-study-20260928-arrow'],
 arrow_guide['purpose'], arrow_guide['invariants'], arrow_guide['adjustments'],
 arrow_guide['constraints'], arrow_guide['fallback'], arrow_guide['coverage'],
 ['arrow-generalization-20261008','arrow-solid-draft-20261008'], 'P1', '保留已知短窗/冗余失败，补独立可见目标与连续观片听感；四向技术对照不算新模板或新语义正例。'),
('彩纸庆祝', 'style-study-20260928-celebrate', ['style-study-20260928-celebrate'],
 '用于明确庆祝、达成、里程碑；严肃或负向内容不适合触发。',
 '保持七片彩纸由中心散开、转动下落并淡出的节奏；彩纸是轻量陪衬，不成为全屏遮罩。',
 '可整体调整爆发位置、尺寸及事件密度；减片数或改变轨迹是本次定制组合。',
 '检查完整粒子轨迹的画面范围及人物/字幕遮挡，不能只检查稳定帧；密集事件不能累计残留成彩纸雨。',
 '先减少触发密度，再采用更小范围的定制组合，空间或语义不合适时关闭庆祝。',
 '七个可编辑矩形有独立x/y/rotation/opacity关键帧；暂无当前有效审美评审或连续密集事件验证。',
 [], 'P2', '完整轨迹、密集触发和非庆祝负例；补独立素材质感。'),
('学习插画', 'style-study-20260928-learning', ['style-study-20260928-learning'],
 '用于居家学习、阅读或自我提升主题的补充插画，不能替代真实讲解图示。',
 '保持当前插画完整比例、透明边缘与轻柔向上浮入；背景留白服务于插画识别。',
 '可通过artwork资源槽替换为同视觉体系且来源清楚的学习插画，调整整体位置和尺寸。',
 '检查图片来源、许可、透明边缘和小尺寸细节；资源替换后重新审片，不沿用原素材评分。',
 '细节太多时换简洁同题插画或原生图标；没有合适来源的素材时保留正文，不能把截图称为原创生成。',
 '当前为一个image叶层及已绑定artwork，不是原生可拆插画；没有证明任意替换素材都匹配。',
 [], 'P2', '真正扩充学习场景素材及风格一致性；验证透明边缘与替换后的成片。'),
('阅读侧标', 'style-study-20260928-signal', ['style-study-20260928-signal','style-pilot-20260923-marker'],
 '用于简短信息提示或批注；偏阅读型重点，避免与高能花字重复表达。',
 '保持左对齐阅读轴和文字侧边标记。青色版为深蓝底板+亮青竖条；珊瑚版为暖白字+珊瑚竖线与短横，不能只换颜色即算独立设计。',
 '可调整整体位置、行宽与比例；按画面选择有底板或开放侧标，保留标记与文字边界的对应关系。',
 '两行内优先自然换行；左标不能插入字间或离文字过远，深底板不得覆盖人物/图示。',
 '先调整行宽与位置，再用更少装饰的阅读底签；字太小则改字幕分段，不能继续缩小。',
 '青色r3、珊瑚r5已有各自定义及多行/左对齐工作；当前有效90分应用均缺。两者暂合并为一个交付候选方向。',
 ['marker-adaptive-coverage-20260929'], 'P1', '判断侧标两变体是否存在足够视觉差异；在交付计数中先合并。'),
('观点引号', 'style-study-20260928-quotation', ['style-study-20260928-quotation'],
 '用于可归属的观点引用或精炼原话；不得把Agent改写冒充原话。',
 '保留宋体奶油色主文、金黄Georgia左右引号的书面层级，引号对应文字两端且运动同步。',
 '可调整整体位置、主文行宽与大小；引用范围由内容决定，长段引用宜使用独立阅读区。',
 '左右引号不得与首尾文字相撞或悬空，双行时检查基线与两侧留白；人脸与手势仍须保护。',
 '先换空位/阅读区，再减少引用长度并保留原意；过短事件换轻量重点词，不能用重引号制造难读闪现。',
 'r5有三实拍精确中央应用79分，手势遮挡和短词阅读未通过；尚未中文/多画幅完整评审。',
 [], 'P1', '先解决引用整体宽度与手势，再用新原话检验双行和短句。'),
('星光强调', 'style-pilot-20260923-sparkle-follow', ['style-study-20260928-measured-sparkle','style-pilot-20260923-sparkle-follow'],
 '用于轻快、惊喜或温暖批注；星光应强调内容，不随所有词密集闪烁。',
 '保留文字与星光的边缘依附、明亮点光与主体文字层级；淡紫花字与暖纸批注属于同方向组合变体。',
 '可调整整体比例、行宽、位置及星光资源槽；暖纸版保留左对齐与星光衬底，花字版保留中心粗字及回弹。',
 '星光不应挡住字的笔画或在换行后漂到空处；透明图片必须保持干净边缘，不把位图叶层称可拆矢量。',
 '背景太亮先换安静区域或暖纸衬底变体，仍影响阅读时移除星光形成定制组合或换普通重点词。',
 '星光弹字r5、测量边缘星光r3已有依附修订；r4历史87分不继承。新输入与素材替换仍未完整审美通过。',
 [], 'P1', '星光大小、边缘间距及复杂背景辨识，验证替换素材保持风格。'),
('宋体讲述', 'style-study-20260924-serif', ['style-study-20260924-serif'],
 '用于较平静的叙述、知识或人文表达的完整字幕；不以字体现成“高级感”替代阅读质量。',
 '保留Songti SC的衬线笔画、暖白文字与深描边、浅黄句内重点和轻微上移；避免换成无衬线后仍称同款。',
 '可调整字幕区宽度、整体大小与位置，按语义标注重点；字体替换仅允许相近且重新实测的衬线字体。',
 '最多两行；小尺寸要检查细横笔画、英文/数字回退字体与描边吞字，不只看整体框大小。',
 '先放大阅读区域，再选择更清楚的字号；高干扰背景或快速口播改用清晰无衬线字幕。',
 'r3为sentence绑定及text_highlight处理；当前没有充分证明跨语言和手机输出细笔画的可读性。',
 [], 'P1', '中文实拍、数字英文混排、小屏与弱光背景的细笔画审片。'),
('消散重影', 'style-study-20260924-echo', ['style-study-20260924-echo'],
 '用于短促冲击、反差或情绪强调；不作为持续正文的阅读方式。',
 '主白字持续可读，红/青重影只在入口从两侧收敛并消散；三份文字内容、字号、换行一致。',
 '可调整整体位置、行宽与比例；重影位移/透明度的修改需作为本次定制组合并审查眩晕与视觉竞争。',
 '禁止主文被重影遮没，重影不能在稳定期成为三重文本；所有关键帧的边界都须在安全区内。',
 '先减少强调密度或选安静位置；时间太短看不清时用静态主字/较轻模板，不保留只剩彩色糊影的入口。',
 'r4有主字透明度与双行修订；r3历史82分不继承到当前。仍需实时速度与新背景审片。',
 [], 'P1', '短事件主字稳定窗口、三层一致适配及动效阅读成本。'),
('奶油底签', 'style-pilot-20260923-adaptive', ['style-pilot-20260923-adaptive'],
 '用于安静、清楚的阅读型重点词或短批注；比大幅跳动花字更适合普通信息。',
 '保留深灰左对齐字、奶油底色、圆角和按文本尺寸包裹的留白；仅轻微透明度入退场。',
 '可分别调整文字行宽、整体比例和位置；不因长词自动把字号压到不可读。',
 '最多两行；背景覆盖以实际文字框与padding测量，不得把大片空底遮住人物。1280×720已测44.2px，但不是任意应用的字号保证。',
 '先换行宽和空位，再调整本次字号预算；仍挤则缩小强调范围或移到独立字幕，不加无关装饰补空。',
 'r7已有四输入16事件、44.2px/一两行/no overflow的应用证据；位置按人工保护区选取，最短0.36秒的阅读听感尚未完成。',
 ['cream-readable-width-20260930'], 'P0', '在新输入保持阅读分量与留白，验证短事件和纵向画幅。'),
('双层花字', 'style-pilot-20260923-offset', ['style-pilot-20260923-offset','dynamic-905625bd-59aa-4338-9c11-6e6cc8e95660'],
 '用于综艺式重点、情绪与结论短语；不适合大量连续正文。',
 '白色前景与粉色错位底形成统一厚度，黑描边与轻倾斜/回弹保持；前后层必须同文同字号同换行并整体退场。',
 '可调整整体位置、行宽和比例；本次改变底层偏移应保留轮廓连续，不逐层独立缩放。',
 '两层实际fit字号必须一致；多行不能露出另一份错误文本，最外侧描边及倾斜后的边界不能出画。',
 '先换空位与行宽；短事件或背景拥挤时选轻量单层强调。拆层或改厚度需以定制组合留证，不继承原应用评分。',
 'r8已有四输入16事件前后字号45.09–50px一致和组退场检查；验收·双层花字是literal/video_start的历史试验，不能当通用声音驱动模板。',
 ['offset-equal-fit-20260930'], 'P0', '未参与调参的长词/密集词、新背景；不将历史literal测试条目再计一款。'),
]

variant_notes = {
 'style-study-20260930-checklist-split-roles': '本条目包含sentence主字幕与keyword侧栏；关键词和图标从keyword_start保持到cue_end、最长3秒，不能把全文塞进侧栏。',
 'style-study-20260930-checklist-sidebar-large': '本条目正文40源像素、最多3行；大字侧栏仍不是所有长口播的默认布局。',
 'style-study-20260930-checklist-sidebar': '本条目正文32源像素、最多5行；已有阅读风险，应作为候选备份，不默认推荐给长句。',
 'style-study-20260929-checklist-headline': '本条目是78源像素关键词花字与清单组合；三条装饰清单不绑定三项真实任务。',
 'style-study-20260929-checklist': '本条目只有20个图形叶层，没有可读正文；应用时另配文字，不能当完整成片模板。',
 'style-study-20260929-bulb': '本条目只有16个可编辑图形；没有文字依附目标，组合时需显式建立与正文/花字的关系。',
 'style-study-20260928-idea': '本条目是image资源artwork加浅色圆衬，与原生16层灯泡不同；不能宣称图片内部部件可编辑。',
 'style-study-20260929-note-caption': '本条目绑定sentence，以左对齐暖黄纸面承载完整字幕；最多2行，所有cue_start都可能出现，需检查密度。',
 'style-study-20260929-note-paper': '本条目绑定keyword，72源像素暖黄纸条，最多3行，图层是文字/胶带/高光三层。',
 'style-study-20260924-note': '本条目r8为5叶层，70ms入口/30ms组退场；阴影固定0.35透明度及胶带两道高光保留。',
 'style-study-20260929-growth-headline': '本条目92源像素奶油花字绑定keyword，九个柱形部件依附文字上方，120ms入口/60ms退场。',
 'style-study-20260929-bold-growth': '本条目是9个原生矩形的复古三柱，没有正文；要与文本或声音事件组合交付。',
 'style-study-20260928-growth': '本条目为8个叶层的圆底三柱，与复古9层版同属增长方向，不重复计数。',
 'style-caption-inline-soft-panel-candidate-20260929': '本候选40源像素、1.4描边、深色轻底板；text_highlight未设active_word，不能称逐词跟读。',
 'style-caption-inline-fine-candidate-20260929': '本候选40源像素、1.4细描边、无底板；亮背景重点检查笔画对比。text_highlight不是active_word。',
 'style-caption-inline-cyan-candidate-20260929': '本候选40源像素、3描边，青色句内重点；不能把语义重点误当随词时间逐个变色。',
 'style-caption-compact-candidate-20260929': '本候选40源像素、3描边、黄色active_word；它是主字幕的紧凑变体，不新增风格计数。',
 'style-pilot-20260923-caption': '本条目64源像素、5描边、黄色active_word；使用测得词时间，不把旧70ms/100ms相位值等同于实际opacity动画。',
 'style-clock-detail-candidate-20260929': '本候选21图形含12点刻度和黄铜轴心，无group treatment；逐层淡出与小尺寸细节必须单独验证。',
 'style-study-20260929-clock': '本条目11图形、root独立事件组；不要把装饰指针角度解释为真实钟面读数。',
 'style-cyan-accent-candidate-20260929': '本候选64源像素粗字加4个笔触/衬层；图文整体的动态范围要计入安全边距。',
 'style-cyan-translucent-candidate-20260929': '本候选100源像素、2描边、深色背景；与无底板r2的评分不能互相继承。',
 'style-study-20260928-cyan-impact': '本条目是keyword驱动青色弹字，90ms入口/40ms退场；保留高能量用途，不用于整段字幕。',
 'live-cyan-caption-20260919': '历史参考观测条目：literal绑定、maxLines=1；只能提供造型参考，正式声音关键词应用选cyan-impact。',
 'style-study-20260928-signal': '本条目是浅白字/深蓝底板、青色竖线，左对齐最多2行；标记位置以实际文字框为准。',
 'style-pilot-20260923-marker': '本条目是暖白字/珊瑚竖线与底部短横，无文字背景；更轻但复杂背景对比需额外验证。',
 'style-study-20260928-measured-sparkle': '本条目76源像素左对齐暖纸+image星光+ellipse衬底，3叶层；跟随text_box的依附保持。',
 'style-pilot-20260923-sparkle-follow': '本条目84源像素淡紫居中花字+image星光，2叶层；与暖纸批注不是两个已合格款。',
 'style-study-20260924-serif': '本条目绑定sentence，高亮未设active_word，属于句内重点；不能承诺逐词全部点亮。',
 'style-study-20260924-echo': '本条目3文本层100源像素/7描边；红青影入口透明度峰值0.55，主字保持稳定可见。',
 'style-pilot-20260923-adaptive': '本条目68源像素、600字重、round radius 20，40ms入退透明度；这是安静阅读样式。',
 'style-pilot-20260923-offset': '本条目两层100源像素/7描边，2行上限，120ms入口和60ms组退场；两层fit预算必须一致。',
 'dynamic-905625bd-59aa-4338-9c11-6e6cc8e95660': '历史功能验收条目：两层literal、video_start、最大2秒；不是按关键词动态生成的正式模板，保留供回溯。',
}

canonical = lambda value: json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
entries = []
family_output = []
for index, (name, primary, ids, purpose, invariants, adjustments, constraints, fallback, coverage, dirs, priority, gap) in enumerate(families, 1):
    evidence = [str(pathlib.Path('/Users/zhengwei/Downloads') / p) for p in dirs if (pathlib.Path('/Users/zhengwei/Downloads') / p).exists()]
    missing_evidence = [p for p in dirs if not (pathlib.Path('/Users/zhengwei/Downloads') / p).exists()]
    family_output.append({'direction': index, 'name': name, 'primaryAssetId': primary, 'assetIds': ids, 'priority': priority, 'nextEvidence': gap, 'evidenceDirectories': evidence, 'unresolvedEvidenceDirectoryNames': missing_evidence, 'status': 'candidate_not_accepted'})
    for asset_id in ids:
        a = assets[asset_id]
        elements = [row['content']['element'] for row in a['layers'] if row['content']['kind'] == 'element']
        styles = {s['id']: s for s in a['styles']}
        facts = {'canvas': a['canvas'], 'leafCount': len(elements), 'textLayers': [], 'spatialRelations': a.get('spatialRelations', []), 'resourceSlots': a['resourceSlots'], 'resourceBindings': a['resourceBindings'], 'hasGroupTreatment': any(p.get('target', {}).get('kind') == 'group' for p in a['applications'])}
        for e in elements:
            if e['features']['representation'] == 'text':
                s = styles[e['styleId']]
                facts['textLayers'].append({'id': e['id'], 'binding': e['binding'], 'fontFamily': s['fontFamily'], 'sourceFontSize': s['fontSize'], 'maxLines': s['maxLines'], 'textAlign': s['textAlign'], 'fill': s['fill'], 'strokeWidth': s['strokeWidth'], 'timing': e['timing'], 'motionTiming': e.get('motionTiming'), 'motionProperties': [m['property'] for m in e['motions']]})
        text_limits = '；'.join(f"{t['id']}按{t['binding']}绑定、最多{t['maxLines']}行" for t in facts['textLayers'])
        guide = {'purpose': purpose, 'invariants': invariants, 'adjustments': adjustments + ' 所有应用修改保存在本次应用，不隐式更新模板。', 'constraints': constraints + (' 当前定义：' + text_limits + '。' if text_limits else ''), 'fallback': fallback, 'coverage': coverage + ' 本次仅复核定义与既有记录，未新增连续观片/试听或90分评审。'}
        if asset_id in variant_notes:
            guide['invariants'] += ' ' + variant_notes[asset_id]
        if a.get('usageGuide'):
            guide = a['usageGuide']  # Preserve reviewed author prose; no automatic replacement.
        current_reviews = [r for r in reviews if r.get('current') and r.get('evidenceCurrent') and r['submission']['application']['assetId'] == asset_id]
        role = 'primary_candidate' if asset_id == primary else 'same_direction_variant'
        if asset_id in ['live-cyan-caption-20260919','dynamic-905625bd-59aa-4338-9c11-6e6cc8e95660']:
            role = 'historical_reference_not_delivery_candidate'
        entries.append({'assetId': asset_id, 'name': a['name'], 'direction': name, 'role': role, 'baseRevision': a['revision'], 'sourceDefinitionSha256': hashlib.sha256(canonical(a).encode()).hexdigest(), 'operation': 'preserve_existing' if a.get('usageGuide') else 'draft_add_usage_guide', 'usageGuide': guide, 'definitionFacts': facts, 'evidenceDirectories': evidence, 'currentApplicationReviews': [{'id': r['id'], 'total': r['total'], 'meetsInternalThreshold': r['meetsInternalThreshold'], 'listened': r['listened'], 'application': r['submission']['application']} for r in current_reviews]})

assert len(families) == 20
assert len(entries) == len(assets) == 41
assert {e['assetId'] for e in entries} == set(assets)
for entry in entries:
    assert set(entry['usageGuide']) == {'purpose','invariants','adjustments','constraints','fallback','coverage'}
    assert all(1 <= len(v) <= 4000 for v in entry['usageGuide'].values())
output = {'schemaVersion': 'moirai.usage-guide-editorial-draft.v1', 'observedDate': '2026-10-07', 'source': 'local dynamic-assets/reviews API snapshots; local production record read-only audit', 'scope': '41 active entries; 62 archived preserved and not rewritten', 'warning': 'Editorial drafts, not yet saved or visually accepted. A guide changes revision when saved; existing scores do not migrate. Numeric source style properties are not guaranteed output sizes.', 'counts': {'active':len(entries),'archived':len(archived),'directions':20,'newGuideDrafts':sum(e['operation']=='draft_add_usage_guide' for e in entries),'preservedGuides':sum(e['operation']=='preserve_existing' for e in entries),'qualifiedNewDeliverables':0}, 'directions': family_output, 'entries':entries}
(root / 'guide-drafts.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(output['counts'], ensure_ascii=False))
