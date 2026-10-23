/* test story (replaced by the full script) */
(function (kit) {
  "use strict";
  var text = `
## prologue | 楔子 · 灵河 | 灵河岸绛珠承露　离恨天仙草还泪
@bg qinfang
@music dream
却说西方灵河岸上，三生石畔，有绛珠草一株。
@show daiyu calm l
@note 能解者方有辛酸之泪，哭成此书。——甲戌本脂批
黛玉：他是甘露之惠，我并无此水可还。
（只是这一身的眼泪……）
@hud on
? 你如何应他？
* 「我没有那个。」 -> a | heart+1
* （垂首不语） -> b
:: a
宝玉：这个妹妹我曾见过的。
@tear repay
@goto c
:: b
@tear vain
:: c
@poem test
@compose haitang
@if hai_dai>=2 -> d
众人：好诗。
:: d
@ending huanlei
`;
  kit.story = {
    text: text,
    titleScene: ["qinfang", ""],
    chapters: { prologue: { season: "楔子" } },
    poems: {
      test: { title: "题帕三绝", by: "潇湘妃子", seal: "潇湘", lines: ["眼空蓄泪泪空垂", "暗洒闲抛却为谁", "尺幅鲛绡劳惠赠", "为君那得不伤悲", "", "抛珠滚玉只偷潸", "镇日无心镇日闲", "枕上袖边难拂拭", "任他点点与斑斑"] },
      my_haitang: { title: "咏白海棠（你的）", hidden: true, lines: [] }
    },
    endings: { huanlei: { name: "质本洁来还洁去", kind: "还泪", text: ["测试结局。"] } },
    compose: {
      haitang: {
        title: "咏白海棠", rule: "限门盆魂痕昏", slots: 4, result: "my_haitang",
        prompts: ["首联", "颔联", "颈联", "尾联"],
        tally: { dai: "hai_dai", chai: "hai_chai", yun: "hai_yun" },
        options: [
          [{ from: "dai", lines: ["半卷湘帘半掩门", "碾冰为土玉为盆"], note: "" }, { from: "chai", lines: ["珍重芳姿昼掩门", "自携手瓮灌苔盆"], note: "" }],
          [{ from: "dai", lines: ["偷来梨蕊三分白", "借得梅花一缕魂"], note: "" }, { from: "chai", lines: ["胭脂洗出秋阶影", "冰雪招来露砌魂"], note: "" }],
          [{ from: "dai", lines: ["月窟仙人缝缟袂", "秋闺怨女拭啼痕"], note: "" }, { from: "chai", lines: ["淡极始知花更艳", "愁多焉得玉无痕"], note: "" }],
          [{ from: "dai", lines: ["娇羞默默同谁诉", "倦倚西风夜已昏"], note: "" }, { from: "chai", lines: ["欲偿白帝凭清洁", "不语婷婷日又昏"], note: "" }]
        ]
      }
    }
  };
})(window.HonglouKit);
