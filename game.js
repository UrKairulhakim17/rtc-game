class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.selectedUnit = null;
        this.selectedBuilding = null;
        this.selectionIndicator = null;
        this.tooltipText = null;
        this.resourceTexts = {}; // FIX for TypeError
    }

    preload() {
        // Load assets from a reliable CDN (jsDelivr from a GitHub repo)
        const baseUrl = 'https://cdn.jsdelivr.net/gh/nicopowa/kenney-tiny-rts/Assets/PNG/';
        this.load.image('istana', baseUrl + 'tower_large_round.png');
        this.load.image('barracks', baseUrl + 'barracks_tent.png'); // Corrected filename
        this.load.image('house', baseUrl + 'house_large.png');
        this.load.image('swordsman', baseUrl + 'character_knight.png'); // Use knight asset for swordsman
        this.load.image('woodmill', baseUrl + 'tower_small_round.png');
        this.load.image('quarry', baseUrl + 'tower_small_round.png');
    }

    create() {
        this.input.mouse.disableContextMenu();
        // FIX: Use a simple green rectangle for the background
        this.add.rectangle(this.game.config.width / 2, this.game.config.height / 2, this.game.config.width, this.game.config.height, 0x2E6430).setDepth(-1);

        this.playerUnits = this.physics.add.group();
        this.enemyUnits = this.physics.add.group();
        this.playerBuildings = this.physics.add.group({ classType: Phaser.GameObjects.Rectangle });
        this.enemyBuildings = this.physics.add.group({ classType: Phaser.GameObjects.Rectangle });

        this.setupUI();
        this.setupInputHandling();
        this.setupCollisions();

        this.recreateBuilding({ type: 'Istana', x: 100, y: this.game.config.height / 2, id: 'player_keep', isPlayer: true });
        this.recreateBuilding({ type: 'Istana', x: this.game.config.width - 100, y: this.game.config.height / 2, id: 'enemy_keep', isPlayer: false });

        // AI Timer to spawn enemy units
        this.time.addEvent({
            delay: 15000,
            callback: () => this.trainUnit('Swordsman', false),
            loop: true
        });
    }

    update(time, delta) {
        if (this.selectedUnit && this.selectionIndicator) {
            this.selectionIndicator.setPosition(this.selectedUnit.x, this.selectedUnit.y);
        }

        if (this.tooltipText && this.tooltipText.visible) {
            this.tooltipText.setPosition(this.input.activePointer.x + 15, this.input.activePointer.y + 15);
        }

        if (!gameState.isPaused) {
            this.generateResources(delta);
            this.processUnitAI(delta);
        }
    }

    processUnitAI(delta) {
        this.playerUnits.getChildren().forEach(unit => this.checkStopMovement(unit));
        this.enemyUnits.getChildren().forEach(unit => this.checkStopMovement(unit));
        
        this.enemyUnits.getChildren().forEach(unit => {
            if (!unit.attackTarget && !unit.moveTarget) {
                const playerKeep = this.playerBuildings.getMatching('type', 'Istana')[0];
                if (playerKeep) this.commandUnitMove(unit, playerKeep.x, playerKeep.y);
            }
        });

        this.playerUnits.getChildren().forEach(unit => this.handleUnitAttack(unit, delta));
        this.enemyUnits.getChildren().forEach(unit => this.handleUnitAttack(unit, delta));
    }
    
    checkStopMovement(unit) {
        if (unit.moveTarget) {
            const distance = Phaser.Math.Distance.Between(unit.x, unit.y, unit.moveTarget.x, unit.moveTarget.y);
            if (distance < 10) {
                unit.body.stop();
                unit.moveTarget = null;
            }
        }
    }

    handleUnitAttack(unit, delta) {
        if (!unit.attackTarget || !unit.attackTarget.active) {
            unit.attackTarget = null;
            return;
        }
        const distance = Phaser.Math.Distance.Between(unit.x, unit.y, unit.attackTarget.x, unit.attackTarget.y);
        if (distance > unit.attackRange) {
            this.physics.moveToObject(unit, unit.attackTarget, unit.speed);
        } else {
            unit.body.stop();
            unit.attackTimer -= delta;
            if (unit.attackTimer <= 0) {
                unit.attackTarget.takeDamage(unit.attack);
                unit.attackTimer = 1000;
            }
        }
    }
    
    generateResources(delta) {
        const timeFactor = delta / 1000;
        let woodGeneration = 0;
        let stoneGeneration = 0;
        this.playerBuildings.getChildren().forEach(b => {
            if (b.type === 'Kem Pembalak') woodGeneration += 5;
            if (b.type === 'Kuari') stoneGeneration += 3;
        });
        gameState.wood += woodGeneration * timeFactor;
        gameState.stone += stoneGeneration * timeFactor;
        this.updateResourceDisplay();
    }
    
    setupUI() {
        const textStyle = { fontSize: '20px', fill: '#FFF', stroke: '#000', strokeThickness: 4 };
        this.add.rectangle(0, 0, this.game.config.width, 40, 0x000000, 0.5).setOrigin(0);
        let xPos = 10;
        ['wood', 'stone', 'gold', 'population'].forEach(res => {
            this.resourceTexts[res] = this.add.text(xPos, 10, '', textStyle);
            xPos += 180;
        });
        this.updateResourceDisplay();
        
        const panelY = this.game.config.height - 120;
        this.add.rectangle(0, panelY, this.game.config.width, 120, 0x222222, 0.9).setOrigin(0).setDepth(1);

        const createButton = (x, y, text, onClick, width = 110, height = 50) => {
            const btnContainer = this.add.container(x, y).setDepth(2);
            const btnBackground = this.add.rectangle(0, 0, width, height, 0x5a5a5a).setStrokeStyle(2, 0x3a3a3a);
            const btnText = this.add.text(0, 0, text, { fontSize: '14px', fill: '#FFF', align: 'center' }).setOrigin(0.5);

            btnContainer.add([btnBackground, btnText]);
            btnContainer.setSize(width, height);
            btnContainer.setInteractive({ useHandCursor: true })
                .on('pointerover', () => {
                    btnBackground.setFillStyle(0x7a7a7a).setStrokeStyle(2, 0xeeeeee);
                })
                .on('pointerout', () => {
                    btnBackground.setFillStyle(0x5a5a5a).setStrokeStyle(2, 0x3a3a3a);
                    btnContainer.setScale(1);
                })
                .on('pointerdown', (p) => {
                    p.stopPropagation();
                    btnContainer.setScale(0.95);
                    if (onClick) onClick();
                })
                .on('pointerup', () => {
                     btnContainer.setScale(1);
                });

            return btnContainer;
        };

        let buttonX = 70, buttonY = panelY + 35, spacing = 130;
        this.pauseButton = createButton(buttonX, buttonY, 'PAUSE', () => this.togglePause());
        this.speedButton = createButton(buttonX += spacing, buttonY, `SPEED (1x)`, () => this.cycleGameSpeed());
        createButton(buttonX += spacing, buttonY, 'SAVE', () => this.saveGame());
        createButton(buttonX += spacing, buttonY, 'LOAD', () => this.loadGame());

        buttonX = this.game.config.width - 550; buttonY = panelY + 60; spacing = 130;
        ['Rumah', 'Kem Pembalak', 'Kuari', 'Berek'].forEach(type => {
            const cost = buildingCosts[type];
            createButton(buttonX, buttonY, `${type}\nWood:${cost.wood} Stone:${cost.stone}`, () => this.setBuildMode(type), 120, 60);
            buttonX += spacing;
        });
        
        this.trainSwordsmanButton = createButton(this.game.config.width - 100, panelY + 60, `Train\nSwordsman\nGold: ${unitCosts.Swordsman.gold}`, () => this.trainUnit('Swordsman', true), 120, 60);
        this.trainSwordsmanButton.setVisible(false);
        
        this.tooltipText = this.add.text(0, 0, '', { fontSize: '14px', fill: '#FFF', backgroundColor: 'rgba(0,0,0,0.7)', padding: {x: 5, y: 2} }).setDepth(10);
        this.tooltipText.setVisible(false);
    }
    
    setupInputHandling() {
        this.input.on('pointerdown', (pointer) => {
            if (pointer.rightButtonDown()) {
                if (gameState.buildMode) { this.cancelBuildMode(); } 
                else if (this.selectedUnit) {
                    let target = this.findObjectAtPointer(pointer);
                    if (target && !target.isPlayer) { this.commandUnitAttack(this.selectedUnit, target); } 
                    else { this.commandUnitMove(this.selectedUnit, pointer.x, pointer.y); }
                }
            } else if (pointer.leftButtonDown()) {
                if (!this.input.manager.getTopgameObject(pointer)) {
                    if (gameState.buildMode) { this.placeBuilding(pointer); } 
                    else { this.deselectAll(); }
                }
            }
        });
    }

    setupCollisions() {
        this.physics.add.collider(this.playerUnits, this.enemyUnits);
        this.physics.add.collider(this.playerUnits, this.playerUnits);
        this.physics.add.collider(this.enemyUnits, this.enemyUnits);
        this.physics.add.collider(this.playerUnits, this.playerBuildings);
        this.physics.add.collider(this.playerUnits, this.enemyBuildings);
        this.physics.add.collider(this.enemyUnits, this.playerBuildings);
        this.physics.add.collider(this.enemyUnits, this.enemyBuildings);
        
        this.physics.add.overlap(this.playerUnits, [this.enemyUnits, this.enemyBuildings], (playerUnit, enemy) => { if (!playerUnit.attackTarget) playerUnit.attackTarget = enemy; });
        this.physics.add.overlap(this.enemyUnits, [this.playerUnits, this.playerBuildings], (enemyUnit, player) => { if (!enemyUnit.attackTarget) enemyUnit.attackTarget = player; });
    }

    findObjectAtPointer(pointer) {
        const gameObjects = this.enemyUnits.getChildren().concat(this.enemyBuildings.getChildren());
        for (const obj of gameObjects) {
            if (obj.getBounds().contains(pointer.x, pointer.y)) return obj;
        }
        return null;
    }

    updateResourceDisplay() {
        this.resourceTexts.wood.setText(`Kayu: ${Math.floor(gameState.wood)}`);
        this.resourceTexts.stone.setText(`Batu: ${Math.floor(gameState.stone)}`);
        this.resourceTexts.gold.setText(`Emas: ${Math.floor(gameState.gold)}`);
        this.resourceTexts.population.setText(`Penduduk: ${gameState.population}/${gameState.maxPopulation}`);
    }

    showTemporaryMessage(message, color) {
        const text = this.add.text(this.game.config.width / 2, this.game.config.height / 2, message, { fontSize: '24px', fill: color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
        this.tweens.add({ targets: text, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => text.destroy() });
    }

    trainUnit(unitType, isPlayer) {
        const barracksGroup = isPlayer ? this.playerBuildings : this.enemyBuildings;
        const barracks = barracksGroup.getMatching('type', 'Berek');
        if (barracks.length === 0) { if (isPlayer) this.showTemporaryMessage('You need a Barracks!', '#FF0'); return; }

        const cost = unitCosts[unitType];
        if (isPlayer && gameState.gold < cost.gold) { this.showTemporaryMessage('Not enough gold!', '#FF0'); return; }
        
        if(isPlayer) { gameState.gold -= cost.gold; this.updateResourceDisplay(); }

        const spawnPoint = barracks[0];
        const unit = this.add.image(spawnPoint.x, spawnPoint.y + 60, 'swordsman').setDepth(1);
        unit.setDisplaySize(32, 48); // Set a reasonable size

        if (!isPlayer) {
            unit.setTint(0xFF4136); // Tint enemy units red
        }

        Object.assign(unit, unitProperties[unitType], { id: Phaser.Math.RND.uuid(), isPlayer: isPlayer, attackTimer: 1000, type: unitType });
        
        this.physics.add.existing(unit);
        unit.body.setCircle(16).setCollideWorldBounds(true);
        unit.setInteractive({ useHandCursor: true })
            .on('pointerdown', p => { p.stopPropagation(); if (p.leftButtonDown()) isPlayer ? this.selectUnit(unit) : this.commandUnitAttack(this.selectedUnit, unit); })
            .on('pointerover', () => this.showTooltip(unit.type))
            .on('pointerout', () => this.hideTooltip());
        
        unit.takeDamage = (amount) => {
            unit.health -= amount;
            if (unit.health <= 0) { if (this.selectedUnit === unit) this.deselectUnit(); unit.destroy(); }
        };
        (isPlayer ? this.playerUnits : this.enemyUnits).add(unit);
    }
    
    placeBuilding(pointer) {
        const type = gameState.currentBuildingType;
        if (pointer.y > this.game.config.height - 120 || !type) return;
        const cost = buildingCosts[type];
        if (gameState.gold >= cost.gold && gameState.wood >= cost.wood && gameState.stone >= cost.stone) {
            gameState.gold -= cost.gold; gameState.wood -= cost.wood; gameState.stone -= cost.stone;
            if (type === 'Rumah') gameState.maxPopulation += 5;
            this.updateResourceDisplay();
            this.recreateBuilding({ type, x: pointer.x, y: pointer.y, id: Phaser.Math.RND.uuid(), isPlayer: true });
        } else { this.showTemporaryMessage('Not enough resources!', '#FF0'); }
        this.cancelBuildMode();
    }
    
    recreateBuilding(data) {
        const buildingKeyMap = {
            'Istana': 'istana',
            'Berek': 'barracks',
            'Rumah': 'house',
            'Kem Pembalak': 'woodmill',
            'Kuari': 'quarry'
        };
        const key = buildingKeyMap[data.type];
        const size = buildingCosts[data.type].size;

        const building = this.add.image(data.x, data.y, key).setDepth(0);
        building.setDisplaySize(size.width, size.height);

        if (!data.isPlayer) {
            building.setTint(0x808080); // Tint enemy buildings grey
        }
        
        Object.assign(building, data, { health: buildingCosts[data.type].health });
        this.physics.add.existing(building, true);

        // Resize the physics body to match the display size
        building.body.setSize(size.width, size.height);
        
        building.setInteractive({ useHandCursor: true })
            .on('pointerdown', p => { p.stopPropagation(); if (p.leftButtonDown()) data.isPlayer ? this.selectBuilding(building) : this.commandUnitAttack(this.selectedUnit, building); })
            .on('pointerover', () => this.showTooltip(building.type)).on('pointerout', () => this.hideTooltip());
            
        building.takeDamage = (amount) => {
            building.health -= amount;
            if (building.health <= 0) {
                if (this.selectedBuilding === building) this.deselectBuilding();
                if (building.type === 'Rumah' && building.isPlayer) gameState.maxPopulation -= 5;
                if (building.type === 'Istana') { this.showTemporaryMessage(building.isPlayer ? "DEFEAT" : "VICTORY!", building.isPlayer ? '#F00' : '#0F0'); this.scene.pause(); }
                building.destroy();
            }
        };
        (data.isPlayer ? this.playerBuildings : this.enemyBuildings).add(building);
    }
    
    selectUnit(unit) { this.deselectAll(); this.selectedUnit = unit; unit.setStrokeStyle(2, 0xFFFFFF); if (!this.selectionIndicator) { this.selectionIndicator = this.add.circle(0, 0, 15, 0xFFFFFF, 0.5).setDepth(0); } this.selectionIndicator.setPosition(unit.x, unit.y).setVisible(true); }
    deselectUnit() { if (this.selectedUnit) { this.selectedUnit.setStrokeStyle(); this.selectedUnit = null; if(this.selectionIndicator) this.selectionIndicator.setVisible(false); } }
    selectBuilding(building) { this.deselectAll(); this.selectedBuilding = building; building.setStrokeStyle(3, 0xFFFFFF); if (building.type === 'Berek') this.trainSwordsmanButton.setVisible(true); }
    deselectBuilding() { if (this.selectedBuilding) { this.selectedBuilding.setStrokeStyle(); this.selectedBuilding = null; this.trainSwordsmanButton.setVisible(false); } }
    deselectAll() { this.deselectUnit(); this.deselectBuilding(); if (gameState.buildMode) this.cancelBuildMode(); }
    setBuildMode(type) { this.deselectAll(); gameState.buildMode = true; if (this.ghostBuilding) this.ghostBuilding.destroy(); const size = buildingCosts[type].size; this.ghostBuilding = this.add.rectangle(0, 0, size.width, size.height, 0x00FF00, 0.5); }
    cancelBuildMode() { gameState.buildMode = false; if (this.ghostBuilding) { this.ghostBuilding.destroy(); this.ghostBuilding = null; } }
    commandUnitMove(unit, x, y) { unit.attackTarget = null; unit.moveTarget = {x, y}; this.physics.moveTo(unit, x, y, unit.speed); }
    commandUnitAttack(unit, target) { if(unit && target) { unit.moveTarget = null; unit.attackTarget = target; } }
    showTooltip(text) { this.tooltipText.setText(text).setVisible(true); }
    hideTooltip() { this.tooltipText.setVisible(false); }
    
    togglePause() { gameState.isPaused = !gameState.isPaused; if(gameState.isPaused) this.scene.pause(); else this.scene.resume(); this.pauseButton.setText(gameState.isPaused ? 'RESUME' : 'PAUSE'); }
    cycleGameSpeed() { const speeds = [1, 2, 4]; gameState.gameSpeed = speeds[(speeds.indexOf(gameState.gameSpeed) + 1) % speeds.length]; this.speedButton.setText(`SPEED (${gameState.gameSpeed}x)`); this.physics.world.timeScale = gameState.gameSpeed; }
    saveGame() { this.showTemporaryMessage('Save/Load is complex and disabled in this version.', '#FF0'); }
    loadGame() { this.showTemporaryMessage('Save/Load is complex and disabled in this version.', '#FF0'); }
}

const gameState = { wood: 200, stone: 150, gold: 500, population: 0, maxPopulation: 5, gameSpeed: 1, isPaused: false, buildMode: false };
const buildingCosts = {
    'Istana': { wood: 0, stone: 0, gold: 0, health: 5000, size: { width: 80, height: 80 } },
    'Rumah': { wood: 30, stone: 0, gold: 0, health: 300, size: { width: 40, height: 40 } },
    'Kem Pembalak': { wood: 10, stone: 0, gold: 0, health: 400, size: { width: 50, height: 50 } },
    'Kuari': { wood: 10, stone: 20, gold: 0, health: 500, size: { width: 50, height: 50 } },
    'Berek': { wood: 50, stone: 50, gold: 0, health: 800, size: { width: 70, height: 70 } }
};
const unitCosts = { 'Swordsman': { gold: 50 } };
const unitProperties = { 'Swordsman': { health: 100, attack: 10, speed: 80, attackRange: 50, detectionRange: 200 } };
const config = { type: Phaser.WEBGL, parent: 'game-container', width: 1280, height: 720, scene: [GameScene], physics: { default: 'arcade', arcade: { debug: false, gravity: { y: 0 } } }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } };
const game = new Phaser.Game(config);
