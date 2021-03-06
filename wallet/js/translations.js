window.t = function(str) {
  var dict = {
    home: [`Home`, `Главная`],
    wallet: ['Wallet', `Кошелек`],
    banks: ['Banks', `Банки`],
    explorers: [`Explorers`, `Прочее`],

    blockchain_history: [`Blockchain History`, 'Блокчейн'],
    insurances: [`Insurances Table`, `База страховок`],
    accounts: [`Accounts Table`, `База аккаунтов`],
    validators: [`Validators`, `Валидаторы`],
    smart_updates: [`Smart Updates`, `Смарт Апдейты`],
    network_info: [`Network Info`, `Статистика сети`],
    node_metrics: [`Node Metrics`, `Метрики`],
    docs: [`Docs`, `Документация`],

    web_wallet: ['Web Wallet', 'Веб Кошелек'],
    install: ['Install', 'Установка'],

    assets: [`Assets`, `Ассеты`],
    onchain_exchange: [`Onchain Exchange`, `Ончейн Обменка`]
  }

  let index = ['en', 'ru'].indexOf(app.lang)

  let result = dict[str]
  if (!result) {
    l('Not found translation for ' + str)
    return '~'
  }

  return result[index]
}
