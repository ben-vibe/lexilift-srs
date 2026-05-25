export const FLUTTER_DART_CODE = `import 'dart:math';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: 'https://YOUR_SUPABASE_URL.supabase.co',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  );

  runApp(const LexiLiftApp());
}

class LexiLiftApp extends StatelessWidget {
  const LexiLiftApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LexiLift SRS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Inter',
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF020617)),
      ),
      home: const MainTabNavigator(),
    );
  }
}

class MainTabNavigator extends StatefulWidget {
  const MainTabNavigator({super.key});

  @override
  State<MainTabNavigator> createState() => _MainTabNavigatorState();
}

class _MainTabNavigatorState extends State<MainTabNavigator> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    HomeScreen(),
    StudyScreen(),
    ExploreScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Colors.grey.shade200, width: 1)),
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.book_outlined), selectedIcon: Icon(Icons.book), label: 'Study'),
            NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view), label: 'Explore'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}

// Data models
class SeedWord {
  final String id;
  final String word;
  final String translation;
  final String difficultyLevel;
  final int frequencyRank;
  final String phonetic;
  final String exampleSentence;
  final bool custom;

  SeedWord({
    required this.id,
    required this.word,
    required this.translation,
    required this.difficultyLevel,
    required this.frequencyRank,
    required this.phonetic,
    required this.exampleSentence,
    this.custom = false,
  });

  factory SeedWord.fromJson(Map<String, dynamic> json) {
    return SeedWord(
      id: json['id'] ?? json['word'].toString().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-'),
      word: json['word'],
      translation: json['translation'],
      difficultyLevel: json['difficulty_level'],
      frequencyRank: json['frequency_rank'],
      phonetic: json['phonetic'],
      exampleSentence: json['example_sentence'],
      custom: json['custom'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'word': word,
    'translation': translation,
    'difficulty_level': difficultyLevel,
    'frequency_rank': frequencyRank,
    'phonetic': phonetic,
    'example_sentence': exampleSentence,
    'custom': custom,
  };
}

class WordProgress {
  final String status;
  final double easeFactor;
  final int interval;
  final DateTime nextReview;
  final DateTime? lastReviewed;

  WordProgress({
    required this.status,
    required this.easeFactor,
    required this.interval,
    required this.nextReview,
    this.lastReviewed,
  });

  factory WordProgress.fromJson(Map<String, dynamic> json) {
    return WordProgress(
      status: json['status'] ?? 'new',
      easeFactor: (json['ease_factor'] as num?)?.toDouble() ?? 2.5,
      interval: json['interval'] ?? 0,
      nextReview: DateTime.parse(json['next_review'] ?? DateTime.now().toIso8601String()),
      lastReviewed: json['last_reviewed'] != null ? DateTime.parse(json['last_reviewed']) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'status': status,
    'ease_factor': easeFactor,
    'interval': interval,
    'next_review': nextReview.toIso8601String(),
    'last_reviewed': lastReviewed?.toIso8601String(),
  };
}

// Spaced Repetition (SM-2 Lite) Logic
WordProgress getNextProgress(WordProgress? current, String rating) {
  final base = current ?? WordProgress(
    status: 'new',
    easeFactor: 2.5,
    interval: 0,
    nextReview: DateTime.now(),
  );

  double nextEase = base.easeFactor;
  if (rating == 'again') nextEase -= 0.2;
  if (rating == 'hard') nextEase -= 0.05;
  if (rating == 'easy') nextEase += 0.15;
  if (nextEase < 1.3) nextEase = 1.3;

  if (rating == 'again') {
    return WordProgress(
      status: 'learning',
      easeFactor: nextEase,
      interval: 0,
      nextReview: DateTime.now(),
      lastReviewed: DateTime.now(),
    );
  }

  double multiplier = 1.2;
  if (rating == 'good') multiplier = 2.5;
  if (rating == 'easy') multiplier = 4.0;

  int nextInterval = (base.interval * multiplier).round();
  if (nextInterval < 1) nextInterval = 1;

  final nextReview = DateTime.now().add(Duration(days: nextInterval));

  return WordProgress(
    status: rating == 'hard' ? 'learning' : 'mastered',
    easeFactor: nextEase,
    interval: nextInterval,
    nextReview: nextReview,
    lastReviewed: DateTime.now(),
  );
}

// Screens
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('LexiLift SRS', style: TextStyle(fontWeight: FontWeight.black)),
      ),
      body: const Center(
        child: Text('Dashboard (Flutter View)'),
      ),
    );
  }
}

class StudyScreen extends StatefulWidget {
  const StudyScreen({super.key});

  @override
  State<StudyScreen> createState() => _StudyScreenState();
}

class _StudyScreenState extends State<StudyScreen> {
  bool _isFlipped = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Study')),
      body: Center(
        child: GestureDetector(
          onHorizontalDragEnd: (details) {
            if (details.primaryVelocity! > 100) {
              // Swipe Right -> KNOW
              _handleSwipe('right');
            } else if (details.primaryVelocity! < -100) {
              // Swipe Left -> LEARN
              _handleSwipe('left');
            }
          },
          onTap: () {
            setState(() {
              _isFlipped = !_isFlipped;
            });
          },
          child: Container(
            width: 320,
            height: 450,
            decoration: BoxDecoration(
              color: _isFlipped ? Colors.white : const Color(0xFF020617),
              borderRadius: BorderRadius.circular(32),
              boxShadow: [
                BoxShadow(color: Colors.black12, blurRadius: 10, spreadRadius: 5),
              ],
            ),
            child: Center(
              child: Text(
                _isFlipped ? 'מילה בעברית' : 'Word in English',
                style: TextStyle(
                  color: _isFlipped ? Colors.black : Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _handleSwipe(String direction) {
    // Update Supabase and save progress
  }
}

class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: Text('Explore (Flutter View)')),
    );
  }
}

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: Text('Profile (Flutter View)')),
    );
  }
}
`;
